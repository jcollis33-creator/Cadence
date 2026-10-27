/* Cadence profile PIN lock.
 * Stores a random data key wrapped by PBKDF2 keys from the PIN and from a recovery code.
 * Profile logs are sealed with AES-GCM. The PIN and recovery code are never stored.
 * Works in the browser (window.CadenceLock) and in Node (globalThis) for tests.
 */
(function (root) {
"use strict";

var ITERATIONS = 100000;
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function available() {
  return !!(root.crypto && root.crypto.subtle && root.crypto.getRandomValues);
}
function subtle() {
  if (!available()) throw new Error("Web Crypto isn't available. A PIN lock needs https or localhost.");
  return root.crypto.subtle;
}
function bytesToB64(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBytes(b64) {
  var s = atob(String(b64 || ""));
  var out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function rand(n) { return root.crypto.getRandomValues(new Uint8Array(n)); }
function validPin(pin) { return /^\d{4,6}$/.test(String(pin || "")); }
function normalizeCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function formatCode(s) { s = normalizeCode(s); return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4) : s; }
function randomCode() {
  var s = "";
  while (s.length < 8) {
    var b = rand(1)[0];
    if (b < 256 - (256 % ALPHABET.length)) s += ALPHABET[b % ALPHABET.length];
  }
  return s;
}
function derive(secret, saltB64, iterations) {
  var enc = new TextEncoder();
  return subtle().importKey("raw", enc.encode(String(secret)), "PBKDF2", false, ["deriveKey"]).then(function (base) {
    return subtle().deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations: iterations, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["wrapKey", "unwrapKey"]
    );
  });
}
function wrapDek(dek, kek) {
  var iv = rand(12);
  return subtle().wrapKey("raw", dek, kek, { name: "AES-GCM", iv: iv }).then(function (ct) {
    return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
  });
}
function unwrapDek(wrap, kek) {
  return subtle().unwrapKey(
    "raw",
    b64ToBytes(wrap.ct),
    kek,
    { name: "AES-GCM", iv: b64ToBytes(wrap.iv) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  ).catch(function () { throw new Error("Wrong PIN"); });
}
function seal(dek, obj) {
  var iv = rand(12);
  var data = new TextEncoder().encode(JSON.stringify(obj));
  return subtle().encrypt({ name: "AES-GCM", iv: iv }, dek, data).then(function (ct) {
    return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
  });
}
function open(dek, sealed) {
  if (!sealed || !sealed.iv || !sealed.ct) return Promise.resolve({ foods: [], weights: [], goals: null });
  return subtle().decrypt({ name: "AES-GCM", iv: b64ToBytes(sealed.iv) }, dek, b64ToBytes(sealed.ct)).then(function (buf) {
    return JSON.parse(new TextDecoder().decode(buf));
  });
}
function setup(pin, opts) {
  if (!validPin(pin)) return Promise.reject(new Error("Use a 4 to 6 digit PIN"));
  opts = opts || {};
  var iterations = opts.iterations || ITERATIONS;
  var recoveryCode = opts.recoveryCode ? normalizeCode(opts.recoveryCode) : randomCode();
  if (recoveryCode.length < 8) return Promise.reject(new Error("Recovery code is too short"));
  var pinSalt = bytesToB64(rand(16));
  var recoverySalt = bytesToB64(rand(16));
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]).then(function (dek) {
    return Promise.all([derive(pin, pinSalt, iterations), derive(recoveryCode, recoverySalt, iterations)]).then(function (keys) {
      return Promise.all([wrapDek(dek, keys[0]), wrapDek(dek, keys[1])]).then(function (wraps) {
        return {
          dek: dek,
          recoveryCode: recoveryCode,
          lock: {
            enabled: true,
            pending: false,
            kdf: "PBKDF2-SHA-256",
            iterations: iterations,
            pinSalt: pinSalt,
            pinWrap: wraps[0],
            recoverySalt: recoverySalt,
            recoveryWrap: wraps[1],
            sealed: null
          }
        };
      });
    });
  });
}
function unlockPin(lock, pin) {
  if (!lock || lock.pending || lock.damaged) return Promise.reject(new Error("This profile has no PIN yet"));
  if (!validPin(pin)) return Promise.reject(new Error("Wrong PIN"));
  return derive(pin, lock.pinSalt, lock.iterations).then(function (kek) { return unwrapDek(lock.pinWrap, kek); });
}
function unlockRecovery(lock, code) {
  if (!lock || lock.pending || lock.damaged) return Promise.reject(new Error("This profile has no recovery code"));
  code = normalizeCode(code);
  if (code.length < 8) return Promise.reject(new Error("Wrong recovery code"));
  return derive(code, lock.recoverySalt, lock.iterations).then(function (kek) {
    return unwrapDek(lock.recoveryWrap, kek).catch(function () { throw new Error("Wrong recovery code"); });
  });
}
function changePin(lock, dek, newPin) {
  if (!validPin(newPin)) return Promise.reject(new Error("Use a 4 to 6 digit PIN"));
  var pinSalt = bytesToB64(rand(16));
  return derive(newPin, pinSalt, lock.iterations).then(function (kek) {
    return wrapDek(dek, kek).then(function (pinWrap) {
      return {
        enabled: true,
        pending: false,
        kdf: lock.kdf || "PBKDF2-SHA-256",
        iterations: lock.iterations,
        pinSalt: pinSalt,
        pinWrap: pinWrap,
        recoverySalt: lock.recoverySalt,
        recoveryWrap: lock.recoveryWrap,
        sealed: lock.sealed || null
      };
    });
  });
}

root.CadenceLock = {
  available: available,
  ITERATIONS: ITERATIONS,
  validPin: validPin,
  normalizeCode: normalizeCode,
  formatCode: formatCode,
  setup: setup,
  unlockPin: unlockPin,
  unlockRecovery: unlockRecovery,
  changePin: changePin,
  seal: seal,
  open: open
};
})(typeof globalThis !== "undefined" ? globalThis : window);
