/* Cadence household sync: merge, offline queue, and passphrase encryption.
 * The Firebase SDK is loaded only after sync is turned on. With sync off, nothing here runs a network call.
 * Works in the browser (window.CadenceSync) and in Node (globalThis) for tests.
 */
(function (root) {
"use strict";

var ITERATIONS = 600000;
var VERIFIER = "cadence-sync-ok";
var FB_VERSION = "11.6.0";

function available() {
  return !!(root.crypto && root.crypto.subtle && root.crypto.getRandomValues);
}
function subtle() {
  if (!available()) throw new Error("Web Crypto isn't available. Sync needs https or localhost.");
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
function configReady(cfg) {
  if (!cfg || typeof cfg !== "object") return false;
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) return false;
  var blob = [cfg.apiKey, cfg.authDomain, cfg.projectId, cfg.appId, cfg.messagingSenderId, cfg.storageBucket].join(" ");
  return !/PASTE_|YOUR_|REPLACE_/.test(blob);
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
  );
}
function encryptJSON(dek, obj) {
  var iv = rand(12);
  var data = new TextEncoder().encode(JSON.stringify(obj));
  return subtle().encrypt({ name: "AES-GCM", iv: iv }, dek, data).then(function (ct) {
    return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
  });
}
function decryptJSON(dek, sealed) {
  if (!sealed || !sealed.iv || !sealed.ct) return Promise.resolve(null);
  return subtle().decrypt({ name: "AES-GCM", iv: b64ToBytes(sealed.iv) }, dek, b64ToBytes(sealed.ct)).then(function (buf) {
    return JSON.parse(new TextDecoder().decode(buf));
  });
}
function setupPassphrase(pass, opts) {
  opts = opts || {};
  if (String(pass || "").length < 8) return Promise.reject(new Error("Use at least 8 characters"));
  var iterations = opts.iterations || ITERATIONS;
  var salt = bytesToB64(rand(16));
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]).then(function (dek) {
    return derive(pass, salt, iterations).then(function (kek) {
      return wrapDek(dek, kek).then(function (wrap) {
        return encryptJSON(dek, { ok: VERIFIER }).then(function (verifier) {
          return {
            dek: dek,
            record: { v: 1, kdf: "PBKDF2-SHA-256", iterations: iterations, salt: salt, wrap: wrap, verifier: verifier }
          };
        });
      });
    });
  });
}
function unlockPassphrase(record, pass) {
  if (!record || !record.salt || !record.wrap || !record.verifier) return Promise.reject(new Error("Wrong passphrase"));
  return derive(pass, record.salt, record.iterations || ITERATIONS).then(function (kek) {
    return unwrapDek(record.wrap, kek);
  }).then(function (dek) {
    return decryptJSON(dek, record.verifier).then(function (v) {
      if (!v || v.ok !== VERIFIER) throw new Error("Wrong passphrase");
      return dek;
    });
  }).catch(function (e) {
    if (e && e.message === "Use at least 8 characters") throw e;
    throw new Error("Wrong passphrase");
  });
}
function exportDek(dek) {
  return subtle().exportKey("raw", dek).then(function (buf) { return bytesToB64(new Uint8Array(buf)); });
}
function importDek(b64) {
  return subtle().importKey("raw", b64ToBytes(b64), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

function cmp(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function emptyHousehold() {
  return { profiles: [], profileTombstones: [], recipes: [], recipeTombstones: [], webFoods: [], webTombstones: [] };
}
function idOf(item) { return item && item.id ? String(item.id) : ""; }
function keyOf(item) { return item && (item.key || item.id) ? String(item.key || item.id) : ""; }
function mergeById(localItems, localTombs, remoteItems, remoteTombs, idFn) {
  var map = {};
  function consider(item, deleted) {
    if (!item) return;
    var id = idFn(item);
    if (!id) return;
    var row = deleted ? { deleted: true, updatedAt: item.updatedAt || "" } : clone(item);
    if (deleted) {
      if (item.key) row.key = String(item.key);
      else row.id = id;
    }
    var prev = map[id];
    if (!prev || cmp(row.updatedAt, prev.updatedAt) > 0) map[id] = row;
  }
  (localItems || []).forEach(function (item) { consider(item, false); });
  (localTombs || []).forEach(function (item) { consider(item, true); });
  (remoteItems || []).forEach(function (item) { consider(item, false); });
  (remoteTombs || []).forEach(function (item) { consider(item, true); });
  var items = [], tombstones = [];
  Object.keys(map).forEach(function (id) {
    var row = map[id];
    if (row.deleted) {
      var t = { updatedAt: row.updatedAt || "", deleted: true };
      if (row.key) t.key = row.key;
      else t.id = row.id || id;
      tombstones.push(t);
    } else items.push(row);
  });
  return { items: items, tombstones: tombstones };
}
function contentRevision(p) {
  var m = (p && (p.contentUpdatedAt || p.updatedAt)) || "";
  function see(list) {
    (list || []).forEach(function (e) { if (e && cmp(e.updatedAt, m) > 0) m = e.updatedAt; });
  }
  if (!p) return "";
  see(p.foods);
  see(p.weights);
  see(p.tombstones);
  see(p.weightTombstones);
  return m;
}
function newerMeta(a, b) {
  if (!a) return b ? clone(b) : null;
  if (!b) return clone(a);
  return cmp(b.updatedAt, a.updatedAt) > 0 ? clone(b) : clone(a);
}
function mergeOneProfile(a, b) {
  if (!a) return b ? clone(b) : null;
  if (!b) return clone(a);
  var aOpaque = !!a.opaque, bOpaque = !!b.opaque;
  if (aOpaque && bOpaque) return cmp(contentRevision(b), contentRevision(a)) > 0 ? clone(b) : clone(a);
  if (aOpaque && !bOpaque) return cmp(contentRevision(a), contentRevision(b)) > 0 ? clone(a) : clone(b);
  if (bOpaque && !aOpaque) return cmp(contentRevision(b), contentRevision(a)) > 0 ? clone(b) : clone(a);
  var foods = mergeById(a.foods, a.tombstones, b.foods, b.tombstones, idOf);
  var weights = mergeById(a.weights, [], b.weights, [], idOf);
  var weightTombs = mergeById([], a.weightTombstones, [], b.weightTombstones, idOf);
  var meta = newerMeta(a, b);
  meta.foods = foods.items;
  meta.tombstones = foods.tombstones;
  meta.weights = weights.items.filter(function (w) {
    var dead = weightTombs.tombstones.some(function (t) { return t.id === w.id && cmp(t.updatedAt, w.updatedAt) >= 0; });
    return !dead;
  });
  meta.weightTombstones = weightTombs.tombstones;
  meta.opaque = false;
  return meta;
}
function mergeHousehold(local, remote) {
  local = local || emptyHousehold();
  remote = remote || emptyHousehold();
  var tombs = mergeById([], local.profileTombstones, [], remote.profileTombstones, idOf).tombstones;
  var tombAt = {};
  tombs.forEach(function (t) { tombAt[t.id] = t; });
  var ids = {};
  (local.profiles || []).forEach(function (p) { if (p && p.id) ids[p.id] = 1; });
  (remote.profiles || []).forEach(function (p) { if (p && p.id) ids[p.id] = 1; });
  var profiles = [];
  Object.keys(ids).forEach(function (id) {
    var a = (local.profiles || []).filter(function (p) { return p.id === id; })[0];
    var b = (remote.profiles || []).filter(function (p) { return p.id === id; })[0];
    var merged = mergeOneProfile(a, b);
    var tomb = tombAt[id];
    if (tomb && (!merged || cmp(tomb.updatedAt, merged.updatedAt || "") >= 0)) return;
    if (merged && !merged.deleted) profiles.push(merged);
  });
  var recipes = mergeById(local.recipes, local.recipeTombstones, remote.recipes, remote.recipeTombstones, idOf);
  var webs = mergeById(local.webFoods, local.webTombstones, remote.webFoods, remote.webTombstones, keyOf);
  return {
    profiles: profiles,
    profileTombstones: tombs,
    recipes: recipes.items,
    recipeTombstones: recipes.tombstones,
    webFoods: webs.items,
    webTombstones: webs.tombstones
  };
}

function printItem(item) {
  var o = clone(item);
  delete o.updatedAt;
  return JSON.stringify(o);
}
function metaPrint(p) {
  return JSON.stringify({
    name: p.name, color: p.color, age: p.age, sex: p.sex, goals: p.goals,
    lock: p.lock ? { enabled: !!p.lock.enabled, pending: !!p.lock.pending, pinSalt: p.lock.pinSalt || "", recoverySalt: p.lock.recoverySalt || "" } : null
  });
}
function capture(model) {
  model = model || emptyHousehold();
  function mapItems(list, idFn) {
    var o = {};
    (list || []).forEach(function (item) {
      var id = idFn(item);
      if (id) o[id] = printItem(item);
    });
    return o;
  }
  return {
    profiles: (model.profiles || []).map(function (p) {
      return {
        id: p.id,
        meta: metaPrint(p),
        updatedAt: p.updatedAt || "",
        foods: mapItems(p.foods, idOf),
        weights: mapItems(p.weights, idOf)
      };
    }),
    recipes: mapItems(model.recipes, idOf),
    webFoods: mapItems(model.webFoods, keyOf)
  };
}
function ensureId(item) {
  if (item.id) return;
  item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function stamp(model, base, now, skipProfile) {
  if (!model) return;
  if (!Array.isArray(model.profileTombstones)) model.profileTombstones = [];
  if (!Array.isArray(model.recipeTombstones)) model.recipeTombstones = [];
  if (!Array.isArray(model.webTombstones)) model.webTombstones = [];
  var baseProfiles = {};
  if (base && base.profiles) base.profiles.forEach(function (p) { baseProfiles[p.id] = p; });
  (model.profiles || []).forEach(function (p) {
    if (!p || !p.id) return;
    if (!Array.isArray(p.foods)) p.foods = [];
    if (!Array.isArray(p.weights)) p.weights = [];
    if (!Array.isArray(p.tombstones)) p.tombstones = [];
    if (!Array.isArray(p.weightTombstones)) p.weightTombstones = [];
    if (skipProfile && skipProfile(p)) { delete baseProfiles[p.id]; return; }
    var prev = baseProfiles[p.id];
    if (!prev || prev.meta !== metaPrint(p)) p.updatedAt = now;
    else if (!p.updatedAt) p.updatedAt = now;
    function stampList(list, prevMap, tombs, idFn) {
      var seen = {};
      (list || []).forEach(function (item) {
        if (idFn === keyOf) { if (!item.key && item.id) item.key = item.id; }
        else ensureId(item);
        var id = idFn(item);
        seen[id] = 1;
        if (!item.updatedAt || (prevMap && prevMap[id] && prevMap[id] !== printItem(item))) item.updatedAt = now;
      });
      if (prevMap) Object.keys(prevMap).forEach(function (id) {
        if (seen[id]) return;
        var already = (tombs || []).some(function (t) { return (t.id || t.key) === id; });
        if (!already) {
          var t = { updatedAt: now, deleted: true };
          if (idFn === keyOf) t.key = id; else t.id = id;
          tombs.push(t);
        }
      });
    }
    stampList(p.foods, prev && prev.foods, p.tombstones, idOf);
    stampList(p.weights, prev && prev.weights, p.weightTombstones, idOf);
    p.contentUpdatedAt = contentRevision(p);
    delete baseProfiles[p.id];
  });
  Object.keys(baseProfiles).forEach(function (id) {
    if (skipProfile && model.profiles.some(function (p) { return p.id === id && skipProfile(p); })) return;
    var exists = model.profileTombstones.some(function (t) { return t.id === id; });
    if (!exists) model.profileTombstones.push({ id: id, updatedAt: now, deleted: true });
  });
  function stampShared(list, tombs, prevMap, idFn) {
    var seen = {};
    (list || []).forEach(function (item) {
      if (idFn === idOf) ensureId(item);
      var id = idFn(item);
      seen[id] = 1;
      if (!item.updatedAt || (prevMap && prevMap[id] && prevMap[id] !== printItem(item))) item.updatedAt = now;
    });
    if (prevMap) Object.keys(prevMap).forEach(function (id) {
      if (seen[id]) return;
      if ((tombs || []).some(function (t) { return (t.id || t.key) === id; })) return;
      var t = { updatedAt: now, deleted: true };
      if (idFn === keyOf) t.key = id; else t.id = id;
      tombs.push(t);
    });
  }
  stampShared(model.recipes, model.recipeTombstones, base && base.recipes, idOf);
  stampShared(model.webFoods, model.webTombstones, base && base.webFoods, keyOf);
}
function ensureStamps(model) {
  var epoch = "1970-01-01T00:00:00.000Z";
  (model.profiles || []).forEach(function (p) {
    (p.foods || []).forEach(function (e) {
      if (!e.id) e.id = "f-" + Math.random().toString(36).slice(2, 10);
      if (!e.updatedAt) e.updatedAt = e.ts || epoch;
    });
    (p.weights || []).forEach(function (w) {
      if (!w.id) w.id = "w-" + Math.random().toString(36).slice(2, 10);
      if (!w.updatedAt) w.updatedAt = (w.date ? String(w.date).slice(0, 10) + "T12:00:00.000Z" : epoch);
    });
    if (!p.updatedAt) p.updatedAt = epoch;
    if (!Array.isArray(p.tombstones)) p.tombstones = [];
    if (!Array.isArray(p.weightTombstones)) p.weightTombstones = [];
  });
  (model.recipes || []).forEach(function (r) {
    if (!r.id) r.id = "r-" + Math.random().toString(36).slice(2, 10);
    if (!r.updatedAt) r.updatedAt = r.updated || epoch;
  });
  (model.webFoods || []).forEach(function (w) {
    if (!w.updatedAt) w.updatedAt = w.lastVerified ? String(w.lastVerified).slice(0, 10) + "T12:00:00.000Z" : epoch;
  });
  if (!Array.isArray(model.profileTombstones)) model.profileTombstones = [];
  if (!Array.isArray(model.recipeTombstones)) model.recipeTombstones = [];
  if (!Array.isArray(model.webTombstones)) model.webTombstones = [];
  return model;
}

function createQueue() {
  var n = 0;
  return {
    note: function () { n += 1; return n; },
    count: function () { return n; },
    clear: function () { n = 0; },
    set: function (v) { n = Math.max(0, +v || 0); }
  };
}
function paths(uid) {
  return {
    key: "users/" + uid + "/shared/key",
    recipes: "users/" + uid + "/shared/recipes",
    webFoods: "users/" + uid + "/shared/webFoods",
    profile: function (id) { return "users/" + uid + "/profiles/" + id; },
    profileCol: "users/" + uid + "/profiles"
  };
}
function decryptDoc(dek, doc) {
  if (!doc || !doc.cipher) return Promise.resolve(null);
  return decryptJSON(dek, doc.cipher);
}
function pullHousehold(backend, dek, uid) {
  var p = paths(uid);
  return Promise.all([
    backend.listDocs(p.profileCol),
    backend.getDoc(p.recipes),
    backend.getDoc(p.webFoods)
  ]).then(function (res) {
    var ids = res[0] || [];
    return Promise.all(ids.map(function (id) {
      return backend.getDoc(p.profile(id)).then(function (doc) { return decryptDoc(dek, doc); });
    })).then(function (bodies) {
      var profiles = [], tombs = [];
      bodies.forEach(function (body) {
        if (!body) return;
        if (body.deleted) tombs.push({ id: body.id, updatedAt: body.updatedAt || "", deleted: true });
        else profiles.push(body);
      });
      return Promise.all([decryptDoc(dek, res[1]), decryptDoc(dek, res[2])]).then(function (shared) {
        var recipesDoc = shared[0] || {}, webDoc = shared[1] || {};
        return {
          profiles: profiles,
          profileTombstones: tombs,
          recipes: recipesDoc.recipes || [],
          recipeTombstones: recipesDoc.tombstones || [],
          webFoods: webDoc.webFoods || [],
          webTombstones: webDoc.tombstones || []
        };
      });
    });
  });
}
function pushHousehold(backend, dek, uid, model, now) {
  var p = paths(uid);
  now = now || new Date().toISOString();
  var writes = [];
  var liveIds = {};
  (model.profiles || []).forEach(function (prof) {
    liveIds[prof.id] = 1;
    writes.push(encryptJSON(dek, prof).then(function (cipher) {
      return backend.setDoc(p.profile(prof.id), { cipher: cipher, updatedAt: now });
    }));
  });
  (model.profileTombstones || []).forEach(function (t) {
    if (liveIds[t.id]) return;
    writes.push(encryptJSON(dek, { id: t.id, deleted: true, updatedAt: t.updatedAt || now }).then(function (cipher) {
      return backend.setDoc(p.profile(t.id), { cipher: cipher, updatedAt: now });
    }));
  });
  writes.push(encryptJSON(dek, { recipes: model.recipes || [], tombstones: model.recipeTombstones || [] }).then(function (cipher) {
    return backend.setDoc(p.recipes, { cipher: cipher, updatedAt: now });
  }));
  writes.push(encryptJSON(dek, { webFoods: model.webFoods || [], tombstones: model.webTombstones || [] }).then(function (cipher) {
    return backend.setDoc(p.webFoods, { cipher: cipher, updatedAt: now });
  }));
  return Promise.all(writes);
}
function syncCycle(local, opts) {
  opts = opts || {};
  var queue = opts.queue;
  if (!opts.online) {
    return Promise.resolve({ ok: false, offline: true, pending: queue ? queue.count() : 0, merged: local });
  }
  return pullHousehold(opts.backend, opts.dek, opts.uid).then(function (remote) {
    var merged = mergeHousehold(local, remote);
    return pushHousehold(opts.backend, opts.dek, opts.uid, merged, opts.now).then(function () {
      if (queue) queue.clear();
      return { ok: true, pending: 0, merged: merged };
    });
  }).catch(function (e) {
    return { ok: false, error: (e && e.message) || "Sync failed", pending: queue ? queue.count() : 0, merged: local };
  });
}
function deleteCloud(backend, uid) {
  var p = paths(uid);
  return backend.listDocs(p.profileCol).then(function (ids) {
    var jobs = (ids || []).map(function (id) { return backend.deleteDoc(p.profile(id)); });
    jobs.push(backend.deleteDoc(p.recipes));
    jobs.push(backend.deleteDoc(p.webFoods));
    jobs.push(backend.deleteDoc(p.key));
    return Promise.all(jobs);
  });
}

var firebasePromise = null;
function loadFirebase() {
  if (firebasePromise) return firebasePromise;
  var base = "https://www.gstatic.com/firebasejs/" + FB_VERSION + "/";
  firebasePromise = Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-auth.js"),
    import(base + "firebase-firestore.js")
  ]).then(function (mods) {
    return { app: mods[0], auth: mods[1], fs: mods[2] };
  }).catch(function (e) {
    firebasePromise = null;
    throw e;
  });
  return firebasePromise;
}
function createFirebaseBackend(libs, firebaseApp) {
  var fs = libs.fs;
  var db = fs.getFirestore(firebaseApp);
  return {
    getDoc: function (path) {
      return fs.getDoc(fs.doc(db, path)).then(function (snap) { return snap.exists() ? snap.data() : null; });
    },
    setDoc: function (path, data) { return fs.setDoc(fs.doc(db, path), data); },
    deleteDoc: function (path) { return fs.deleteDoc(fs.doc(db, path)); },
    listDocs: function (path) {
      return fs.getDocs(fs.collection(db, path)).then(function (snap) {
        var ids = [];
        snap.forEach(function (d) { ids.push(d.id); });
        return ids;
      });
    }
  };
}

root.CadenceSync = {
  ITERATIONS: ITERATIONS,
  VERIFIER: VERIFIER,
  FB_VERSION: FB_VERSION,
  available: available,
  configReady: configReady,
  setupPassphrase: setupPassphrase,
  unlockPassphrase: unlockPassphrase,
  exportDek: exportDek,
  importDek: importDek,
  encryptJSON: encryptJSON,
  decryptJSON: decryptJSON,
  mergeHousehold: mergeHousehold,
  mergeById: mergeById,
  capture: capture,
  stamp: stamp,
  ensureStamps: ensureStamps,
  createQueue: createQueue,
  paths: paths,
  pullHousehold: pullHousehold,
  pushHousehold: pushHousehold,
  syncCycle: syncCycle,
  deleteCloud: deleteCloud,
  loadFirebase: loadFirebase,
  createFirebaseBackend: createFirebaseBackend
};
})(typeof globalThis !== "undefined" ? globalThis : window);
