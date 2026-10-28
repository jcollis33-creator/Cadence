/* Cadence app logic. Plain JS, no dependencies.
 * Profiles live in localStorage key cadence.v5. cadence.v4, cadence.v3, cadence.v2 and cadence.v1 are kept as backups.
 * Sync is off until it is turned on from Goals. */
(function () {
"use strict";
var P = window.CadenceParser, FOODS = window.CADENCE_FOODS, INDEX = P.buildIndex(FOODS);
var KEY = "cadence.v5";
var KEY_V4 = "cadence.v4";
var KEY_V3 = "cadence.v3";
var KEY_V2 = "cadence.v2";
var KEY_V1 = "cadence.v1";
var DEFAULT_GOALS = { kcal: 2200, p: 180, c: 220, f: 70, weight: 180 };
var DEFAULT_SETTINGS = { fdcKey: "", online: true };
var PALETTE = ["#1F5C45", "#1C1B19", "#2E7A5E", "#A4471F", "#7A5A8C", "#B07D2B"];
var IDLE_MS = 5 * 60 * 1000;
var COOLDOWN_MS = 30 * 1000;
var FAIL_LIMIT = 5;
var LOCKOUT_KEY = "cadence.lockout";
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* ---------------- storage ---------------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function copyGoals(g) {
  var o = { kcal: DEFAULT_GOALS.kcal, p: DEFAULT_GOALS.p, c: DEFAULT_GOALS.c, f: DEFAULT_GOALS.f, weight: DEFAULT_GOALS.weight };
  if (g && typeof g === "object") ["kcal", "p", "c", "f", "weight"].forEach(function (k) {
    if (g[k] != null && g[k] !== "" && !isNaN(+g[k]) && +g[k] >= 0) o[k] = +g[k];
  });
  return o;
}
function copySettings(s) {
  var o = { fdcKey: "", online: true };
  if (s && typeof s === "object") {
    if ("online" in s) o.online = !!s.online;
    if (s.fdcKey != null) o.fdcKey = String(s.fdcKey);
  }
  return o;
}
function copyFoods(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (e) { return e && e.ts && Array.isArray(e.items); }).map(function (e) { return JSON.parse(JSON.stringify(e)); });
}
function copyWeights(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (w) { return w && w.date && +w.lb > 0; }).map(function (w) {
    return { id: w.id || uid(), date: String(w.date).slice(0, 10), lb: +w.lb, updatedAt: w.updatedAt || null };
  });
}
function copyAge(v) {
  if (v == null || v === "" || isNaN(+v)) return null;
  var n = Math.round(+v);
  if (n < 1 || n > 120) return null;
  return n;
}
function copySex(v) { return v === "female" || v === "male" ? v : null; }
function defaultDemo(id) {
  if (id === "joseph") return { age: 30, sex: "male" };
  if (id === "cindy") return { age: 30, sex: "female" };
  return { age: null, sex: null };
}
function demoOf(p) {
  var age = p && p.age != null ? copyAge(p.age) : null;
  var sex = p && p.sex ? copySex(p.sex) : null;
  return { age: age == null ? 30 : age, sex: sex || "male", assumed: age == null };
}
function makeProfile(id, name, color, extra) {
  extra = extra || {};
  var demo = defaultDemo(id);
  var age = Object.prototype.hasOwnProperty.call(extra, "age") ? copyAge(extra.age) : demo.age;
  var sex = Object.prototype.hasOwnProperty.call(extra, "sex") ? copySex(extra.sex) : demo.sex;
  return { id: id, name: name, color: color, age: age, sex: sex, foods: copyFoods(extra.foods), weights: copyWeights(extra.weights), goals: copyGoals(extra.goals), lock: extra.lock || null };
}
function blankV2() {
  return {
    version: 5,
    activeProfileId: "joseph",
    profiles: [
      makeProfile("joseph", "Joseph", "#1F5C45"),
      makeProfile("cindy", "Cindy", "#1C1B19", { lock: { enabled: true, pending: true } }),
      makeProfile("leo", "Leo", "#2E7A5E")
    ],
    recipes: [],
    webFoods: [],
    profileTombstones: [],
    recipeTombstones: [],
    webTombstones: [],
    settings: copySettings(null)
  };
}
function copyTombstones(list, field) {
  field = field || "id";
  if (!Array.isArray(list)) return [];
  return list.filter(function (t) { return t && t.deleted && t[field]; }).map(function (t) {
    var o = { updatedAt: String(t.updatedAt || ""), deleted: true };
    o[field] = String(t[field]);
    return o;
  });
}
function copyMicros(m) {
  var o = {};
  P.MICRO_KEYS.forEach(function (k) {
    if (!m || m[k] == null || m[k] === "" || isNaN(+m[k])) o[k] = null;
    else o[k] = +m[k];
  });
  return o;
}
function copyWebFoods(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (w) { return w && w.key && w.name && w.source; }).map(function (w) {
    var per = w.per100 && typeof w.per100 === "object" ? {
      kcal: w.per100.kcal == null || w.per100.kcal === "" || isNaN(+w.per100.kcal) ? null : +w.per100.kcal,
      p: w.per100.p == null || w.per100.p === "" || isNaN(+w.per100.p) ? null : +w.per100.p,
      c: w.per100.c == null || w.per100.c === "" || isNaN(+w.per100.c) ? null : +w.per100.c,
      f: w.per100.f == null || w.per100.f === "" || isNaN(+w.per100.f) ? null : +w.per100.f,
      micros: copyMicros(w.per100.micros)
    } : null;
    return {
      key: String(w.key), query: String(w.query || w.key), source: String(w.source),
      sourceLabel: String(w.sourceLabel || w.source), sourceId: String(w.sourceId || ""),
      sourceUrl: String(w.sourceUrl || ""), name: String(w.name), brand: String(w.brand || ""),
      servingLabel: String(w.servingLabel || ""), grams: +w.grams || null, pieceCount: w.pieceCount || null,
      kcal: w.kcal == null || w.kcal === "" || isNaN(+w.kcal) ? null : +w.kcal,
      p: w.p == null || w.p === "" || isNaN(+w.p) ? null : +w.p,
      c: w.c == null || w.c === "" || isNaN(+w.c) ? null : +w.c,
      f: w.f == null || w.f === "" || isNaN(+w.f) ? null : +w.f,
      micros: copyMicros(w.micros), per100: per, lastVerified: String(w.lastVerified || "").slice(0, 10),
      updatedAt: w.updatedAt || null
    };
  });
}
function wrapOk(w) { return !!(w && typeof w.iv === "string" && typeof w.ct === "string" && w.iv && w.ct); }
function sanitizeLock(lock) {
  if (!lock || typeof lock !== "object" || !lock.enabled) return null;
  if (lock.pending) return { enabled: true, pending: true };
  var iters = +lock.iterations || 100000;
  if (!wrapOk(lock.pinWrap) || !wrapOk(lock.recoveryWrap) || !lock.pinSalt || !lock.recoverySalt || !(iters >= 10000 && iters <= 500000)) {
    if (wrapOk(lock.sealed)) return { enabled: true, pending: false, damaged: true, sealed: { iv: String(lock.sealed.iv), ct: String(lock.sealed.ct) } };
    return null;
  }
  var o = {
    enabled: true, pending: false, kdf: "PBKDF2-SHA-256", iterations: iters,
    pinSalt: String(lock.pinSalt), recoverySalt: String(lock.recoverySalt),
    pinWrap: { iv: String(lock.pinWrap.iv), ct: String(lock.pinWrap.ct) },
    recoveryWrap: { iv: String(lock.recoveryWrap.iv), ct: String(lock.recoveryWrap.ct) },
    sealed: null
  };
  if (wrapOk(lock.sealed)) o.sealed = { iv: String(lock.sealed.iv), ct: String(lock.sealed.ct) };
  return o;
}
function profileFromStored(p, i) {
  var id = String(p.id || uid());
  var name = String(p.name || "Profile").trim().slice(0, 24) || "Profile";
  var color = /^#[0-9A-Fa-f]{6}$/.test(String(p.color || "")) ? String(p.color) : PALETTE[i % PALETTE.length];
  var lock = sanitizeLock(p.lock);
  var sealedOn = !!(lock && lock.enabled && !lock.pending);
  var demo = defaultDemo(id);
  var age = p && Object.prototype.hasOwnProperty.call(p, "age") ? copyAge(p.age) : (sealedOn ? null : demo.age);
  var sex = p && Object.prototype.hasOwnProperty.call(p, "sex") ? copySex(p.sex) : (sealedOn ? null : demo.sex);
  return {
    id: id, name: name, color: color, age: age, sex: sex, lock: lock,
    foods: sealedOn ? [] : copyFoods(p.foods),
    weights: sealedOn ? [] : copyWeights(p.weights),
    goals: sealedOn ? copyGoals(null) : copyGoals(p.goals),
    updatedAt: p.updatedAt || null,
    contentUpdatedAt: p.contentUpdatedAt || null,
    tombstones: sealedOn ? [] : copyTombstones(p.tombstones),
    weightTombstones: sealedOn ? [] : copyTombstones(p.weightTombstones)
  };
}
function sanitizeV2(d) {
  var profiles = [], seen = {};
  (Array.isArray(d.profiles) ? d.profiles : []).forEach(function (p, i) {
    if (!p || typeof p !== "object") return;
    var row = profileFromStored(p, i);
    while (seen[row.id]) row.id = uid();
    seen[row.id] = 1;
    profiles.push(row);
  });
  if (!profiles.length) return blankV2();
  var active = profiles.some(function (p) { return p.id === d.activeProfileId; }) ? d.activeProfileId : profiles[0].id;
  return {
    version: 5,
    activeProfileId: active,
    profiles: profiles,
    recipes: rederiveRecipes(Array.isArray(d.recipes) ? d.recipes : []),
    webFoods: copyWebFoods(d.webFoods),
    profileTombstones: copyTombstones(d.profileTombstones),
    recipeTombstones: copyTombstones(d.recipeTombstones),
    webTombstones: copyTombstones(d.webTombstones, "key"),
    settings: copySettings(d.settings)
  };
}
function finishLoad(s) {
  if (window.CadenceSync) window.CadenceSync.ensureStamps(s);
  return s;
}
function rederiveRecipes(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (r) { return r && r.name; }).map(function (r) {
    var rec = JSON.parse(JSON.stringify(r));
    rec.ingredients = (rec.ingredients || []).map(function (ing) {
      if (!ing || ing.micros || ing.edited) return ing;
      var parsed = P.resolveSegment(P.normalize(ing.text || ing.food || ""), INDEX, {});
      if (parsed && parsed.matched && parsed.micros) {
        ing.micros = parsed.micros;
        if (parsed.fdcId && !ing.fdcId) ing.fdcId = parsed.fdcId;
      }
      return ing;
    });
    var micro = P.sumMicros(rec.ingredients || []);
    var servings = Math.max(1, +rec.servings || 1);
    if (!rec.totals) rec.totals = P.totals(rec.ingredients || []);
    rec.totals.micros = micro;
    if (!rec.perServing) rec.perServing = { kcal: 0, p: 0, c: 0, f: 0 };
    rec.perServing.micros = P.divideMicros(micro, servings);
    return rec;
  });
}
function migrateV1(d) {
  var s = blankV2();
  s.profiles[0].foods = copyFoods(d.foods);
  s.profiles[0].weights = copyWeights(d.weights);
  s.profiles[0].goals = copyGoals(d.goals);
  s.recipes = rederiveRecipes(Array.isArray(d.recipes) ? d.recipes : []);
  s.settings = copySettings(d.settings);
  s.activeProfileId = "joseph";
  return s;
}
function toStored(s) {
  return {
    version: 5,
    activeProfileId: s.activeProfileId,
    webFoods: s.webFoods || [],
    profileTombstones: s.profileTombstones || [],
    recipeTombstones: s.recipeTombstones || [],
    webTombstones: s.webTombstones || [],
    profiles: s.profiles.map(function (p) {
      if (p.lock && p.lock.enabled && !p.lock.pending) {
        return { id: p.id, name: p.name, color: p.color, lock: p.lock, updatedAt: p.updatedAt || null, contentUpdatedAt: p.contentUpdatedAt || null };
      }
      var o = {
        id: p.id, name: p.name, color: p.color, age: p.age, sex: p.sex, foods: p.foods, weights: p.weights, goals: p.goals,
        updatedAt: p.updatedAt || null, contentUpdatedAt: p.contentUpdatedAt || null,
        tombstones: p.tombstones || [], weightTombstones: p.weightTombstones || []
      };
      if (p.lock) o.lock = p.lock;
      return o;
    }),
    recipes: s.recipes,
    settings: s.settings
  };
}
function readJSON(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function load() {
  var parsed = readJSON(KEY);
  if (parsed && typeof parsed === "object") return finishLoad(sanitizeV2(parsed));
  var older = readJSON(KEY_V4) || readJSON(KEY_V3) || readJSON(KEY_V2);
  var s = older && typeof older === "object" ? sanitizeV2(older) : ((readJSON(KEY_V1) && typeof readJSON(KEY_V1) === "object") ? migrateV1(readJSON(KEY_V1)) : blankV2());
  s = finishLoad(s);
  try { localStorage.setItem(KEY, JSON.stringify(toStored(s))); } catch (e1) {}
  return s;
}
var state = load();
var session = { viewId: state.activeProfileId };
var sessionKeys = {};
var saveChain = Promise.resolve();
var fails = {};
try { fails = JSON.parse(sessionStorage.getItem(LOCKOUT_KEY) || "{}") || {}; } catch (e) { fails = {}; }
if (!fails || typeof fails !== "object") fails = {};

function profileById(id) {
  for (var i = 0; i < state.profiles.length; i++) if (state.profiles[i].id === id) return state.profiles[i];
  return null;
}
function hasKey(id) { return !!(id && Object.prototype.hasOwnProperty.call(sessionKeys, id) && sessionKeys[id]); }
function canView(p) {
  if (!p) return false;
  if (!p.lock || !p.lock.enabled) return true;
  if (p.lock.pending || p.lock.damaged) return false;
  return hasKey(p.id);
}
function fallbackProfileId() {
  var j = profileById("joseph");
  if (j && canView(j)) return j.id;
  for (var i = 0; i < state.profiles.length; i++) if (canView(state.profiles[i])) return state.profiles[i].id;
  return state.profiles[0] ? state.profiles[0].id : "joseph";
}
function current() {
  var p = profileById(session.viewId);
  if (!canView(p)) { session.viewId = fallbackProfileId(); p = profileById(session.viewId); }
  return p;
}
if (!canView(profileById(session.viewId))) session.viewId = fallbackProfileId();

function snapshot() {
  return {
    activeProfileId: state.activeProfileId,
    recipes: JSON.parse(JSON.stringify(state.recipes || [])),
    webFoods: JSON.parse(JSON.stringify(state.webFoods || [])),
    profileTombstones: JSON.parse(JSON.stringify(state.profileTombstones || [])),
    recipeTombstones: JSON.parse(JSON.stringify(state.recipeTombstones || [])),
    webTombstones: JSON.parse(JSON.stringify(state.webTombstones || [])),
    settings: JSON.parse(JSON.stringify(state.settings || {})),
    profiles: state.profiles.map(function (p) {
      return {
        id: p.id, name: p.name, color: p.color,
        age: p.age, sex: p.sex,
        foods: JSON.parse(JSON.stringify(p.foods || [])),
        weights: JSON.parse(JSON.stringify(p.weights || [])),
        goals: copyGoals(p.goals),
        updatedAt: p.updatedAt || null,
        contentUpdatedAt: p.contentUpdatedAt || null,
        tombstones: JSON.parse(JSON.stringify(p.tombstones || [])),
        weightTombstones: JSON.parse(JSON.stringify(p.weightTombstones || [])),
        lock: p.lock ? JSON.parse(JSON.stringify(p.lock)) : null,
        open: hasKey(p.id),
        key: hasKey(p.id) ? sessionKeys[p.id] : null
      };
    })
  };
}
function writeSnap(snap) {
  return Promise.all(snap.profiles.map(function (p) {
    if (p.lock && p.lock.enabled && !p.lock.pending) {
      var task = (p.open && p.key)
        ? window.CadenceLock.seal(p.key, { foods: p.foods, weights: p.weights, goals: p.goals, age: p.age, sex: p.sex, tombstones: p.tombstones || [], weightTombstones: p.weightTombstones || [] })
        : Promise.resolve(p.lock.sealed || null);
      return task.then(function (sealed) {
        var lock = JSON.parse(JSON.stringify(p.lock));
        if (sealed) lock.sealed = sealed;
        var live = profileById(p.id);
        if (live && live.lock && sealed) live.lock.sealed = sealed;
        return { id: p.id, name: p.name, color: p.color, lock: lock, updatedAt: p.updatedAt || null, contentUpdatedAt: p.contentUpdatedAt || null };
      });
    }
    var o = {
      id: p.id, name: p.name, color: p.color, foods: p.foods, weights: p.weights, goals: p.goals,
      updatedAt: p.updatedAt || null, contentUpdatedAt: p.contentUpdatedAt || null,
      tombstones: p.tombstones || [], weightTombstones: p.weightTombstones || []
    };
    if (p.lock) o.lock = p.lock;
    o.age = p.age; o.sex = p.sex;
    return o;
  })).then(function (profiles) {
    localStorage.setItem(KEY, JSON.stringify({
      version: 5, activeProfileId: snap.activeProfileId, profiles: profiles, recipes: snap.recipes, webFoods: snap.webFoods,
      profileTombstones: snap.profileTombstones || [], recipeTombstones: snap.recipeTombstones || [], webTombstones: snap.webTombstones || [],
      settings: snap.settings
    }));
  });
}
var stampBase = null;
var applyingSync = false;
function captureStampBase(next) {
  if (!stampBase || !next) return next;
  next.profiles = next.profiles.map(function (p) {
    var live = profileById(p.id);
    if (live && live.lock && live.lock.enabled && !live.lock.pending && !hasKey(live.id)) {
      var old = (stampBase.profiles || []).filter(function (x) { return x.id === p.id; })[0];
      if (old) return old;
    }
    return p;
  });
  return next;
}
function save() {
  if (!applyingSync && window.CadenceSync) {
    window.CadenceSync.stamp(state, stampBase, new Date().toISOString(), function (p) {
      return p.lock && p.lock.enabled && !p.lock.pending && !hasKey(p.id);
    });
  }
  if (window.CadenceSync) stampBase = captureStampBase(window.CadenceSync.capture(state));
  var snap = snapshot();
  var run = saveChain.then(function () { return writeSnap(snap); });
  saveChain = run.catch(function (e) { toast("Could not save: " + (e && e.message ? e.message : "storage is full or blocked")); });
  run.then(function () { if (!applyingSync) noteSyncChange(); }, function () {});
  return run;
}
function lockProfile(id) {
  var p = profileById(id);
  if (!p || !hasKey(id)) return save();
  var queued = save();
  saveChain = queued.then(function () {
    delete sessionKeys[id];
    p.foods = [];
    p.weights = [];
    p.goals = copyGoals(null);
    p.age = null;
    p.sex = null;
  }, function () {});
  return saveChain;
}
function applyOpened(p, dek, data) {
  sessionKeys[p.id] = dek;
  p.foods = copyFoods(data && data.foods);
  p.weights = copyWeights(data && data.weights);
  p.tombstones = copyTombstones(data && data.tombstones);
  p.weightTombstones = copyTombstones(data && data.weightTombstones);
  p.goals = copyGoals(data && data.goals);
  var demo = defaultDemo(p.id);
  if (data && Object.prototype.hasOwnProperty.call(data, "age")) p.age = copyAge(data.age);
  else if (p.age == null) p.age = demo.age;
  if (data && Object.prototype.hasOwnProperty.call(data, "sex")) p.sex = copySex(data.sex);
  else if (!p.sex) p.sex = demo.sex;
}

/* ---------------- utils ---------------- */
function pad(n) { return (n < 10 ? "0" : "") + n; }
function dayKey(d) { d = new Date(d); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function todayKey() { return dayKey(new Date()); }
function toLocalInput(d) { d = new Date(d); return dayKey(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function fromLocalInput(v) { var d = v ? new Date(v) : new Date(); return isNaN(d) ? new Date() : d; }
function fmtTime(d) { return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function fmtDay(k) {
  var d = new Date(k + "T12:00:00"), t = todayKey(), y = dayKey(Date.now() - 864e5);
  if (k === t) return "Today"; if (k === y) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function fmtShort(k) { return new Date(k + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" }); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function n1(x) { return (Math.round((+x || 0) * 10) / 10).toString(); }
function n0(x) { return Math.round(+x || 0).toString(); }
function macroLine(t) { return n0(t.kcal) + " kcal \u00b7 P " + n0(t.p) + " \u00b7 C " + n0(t.c) + " \u00b7 F " + n0(t.f); }
function initial(name) { var s = String(name || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
var toastTimer;
function toast(msg) { var t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600); }
function entryTotals(e) { return P.totals(e.items); }
function dayTotals(k) {
  var foods = current().foods;
  return P.totals([].concat.apply([], foods.filter(function (e) { return dayKey(e.ts) === k; }).map(function (e) { return e.items; })));
}

/* ---------------- tabs ---------------- */
function showTab(name) {
  if (!document.getElementById("view-" + name)) name = "today";
  $$(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + name); });
  $$("#tabs button").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  renderAll();
  window.scrollTo(0, 0);
}
$$("#tabs button").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });
$$("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.goto); if (b.dataset.goto === "food") setTimeout(function () { $("#food-input").focus(); }, 50); }); });
function showSub(name) {
  $$(".seg button").forEach(function (b) { b.classList.toggle("active", b.dataset.sub === name); });
  $$("#view-food .sub").forEach(function (s) { s.classList.toggle("active", s.id === "sub-" + name); });
}
$$("#view-food > .seg button").forEach(function (b) { b.addEventListener("click", function () { showSub(b.dataset.sub); }); });
$("#today-mode").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-nut]");
  if (!b) return;
  todayNut = b.dataset.nut;
  renderToday();
});

/* ---------------- voice ---------------- */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function setupMic(btn, statusEl, onInterim, onFinal) {
  if (!SR) {
    btn.classList.add("unsupported");
    btn.addEventListener("click", function () {
      statusEl.className = "hint warn";
      statusEl.textContent = "Voice input isn't available in this browser" + (navigator.standalone ? " when opened from the Home Screen" : "") +
        ". Tip: tap the text box and use your keyboard's dictation mic instead.";
    });
    return;
  }
  var rec = null, listening = false;
  btn.addEventListener("click", function () {
    if (listening && rec) { rec.stop(); return; }
    if (!window.isSecureContext) { statusEl.className = "hint warn"; statusEl.textContent = "The mic needs https:// or http://localhost. Open Cadence from its web address or a local server."; }
    rec = new SR(); rec.lang = navigator.language || "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    var finalText = "";
    rec.onstart = function () { listening = true; btn.classList.add("listening"); statusEl.className = "hint"; statusEl.textContent = "Listening\u2026 say what you ate"; };
    rec.onresult = function (ev) {
      var interim = ""; finalText = "";
      for (var i = 0; i < ev.results.length; i++) { if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript; else interim += ev.results[i][0].transcript; }
      onInterim((finalText + " " + interim).trim());
    };
    rec.onerror = function (ev) {
      var m = { "not-allowed": "Microphone permission was blocked. Allow mic access for this site (needs https or localhost).",
        "service-not-allowed": "Speech recognition is turned off or unavailable here (on iPhone, enable Siri & Dictation).",
        "no-speech": "Didn't catch that \u2014 try again.", "network": "Speech recognition needs an internet connection in this browser.",
        "audio-capture": "No microphone found." }[ev.error] || ("Voice error: " + ev.error);
      statusEl.className = "hint warn"; statusEl.textContent = m;
    };
    rec.onend = function () {
      listening = false; btn.classList.remove("listening");
      if (finalText.trim()) { if (statusEl.textContent.indexOf("Listening") === 0) statusEl.textContent = ""; onFinal(finalText.trim()); }
      else if (statusEl.textContent.indexOf("Listening") === 0) statusEl.textContent = "";
    };
    try { rec.start(); } catch (e) { statusEl.className = "hint warn"; statusEl.textContent = "Couldn't start the mic: " + e.message; }
  });
}

/* ---------------- lookup ---------------- */
function needsOnline(it) { return it.source === "manual" || (it.source === "db" && it.score < 50) || P.localMissesBrand(it); }
function fdcKey() { return state.settings.fdcKey || "DEMO_KEY"; }
function isoToday() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function monthsBetween(iso) {
  if (!iso) return 99;
  var t = new Date(String(iso).slice(0, 10) + "T12:00:00").getTime();
  if (isNaN(t)) return 99;
  return (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44);
}
function findWeb(name) {
  var k = P.keyOf(name || "");
  if (!k) return null;
  for (var i = 0; i < state.webFoods.length; i++) if (state.webFoods[i].key === k) return state.webFoods[i];
  return null;
}
function upsertWeb(entry) {
  var i = state.webFoods.findIndex(function (w) { return w.key === entry.key; });
  if (i >= 0) state.webFoods[i] = entry; else state.webFoods.push(entry);
}
function enrichOnline(items) {
  if (!state.settings.online || !navigator.onLine) return Promise.resolve({ items: items, error: null });
  var err = null;
  return Promise.all(items.map(function (it) {
    if (!needsOnline(it) || P.localMissesBrand(it)) return it;
    return P.usdaSearch(it.name || it.text, fdcKey()).then(function (res) {
      if (res) { var keepGuess = it.source === "db"; P.applyUsda(it, res); if (keepGuess) it.note += " (local guess replaced)"; }
      return it;
    }).catch(function (e) { err = e.message; return it; });
  })).then(function (r) { return { items: r, error: err }; });
}
function itemsFromText(text, withRecipes) {
  return P.parsePhrase(text, INDEX, { recipes: withRecipes === false ? [] : state.recipes });
}
function blankMicros() {
  var o = {};
  P.MICRO_KEYS.forEach(function (k) { o[k] = null; });
  return o;
}
function keepNum(v) {
  if (v == null || v === "" || isNaN(+v)) return null;
  return +v;
}
function cleanItem(it) {
  var o = { text: it.text, qty: it.qty, unit: it.unit || "", food: it.food, source: it.source, matched: !!it.matched,
    kcal: keepNum(it.kcal), p: keepNum(it.p), c: keepNum(it.c), f: keepNum(it.f) };
  if (o.kcal == null && it.source !== "web") o.kcal = 0;
  if (o.p == null && it.source !== "web") o.p = 0;
  if (o.c == null && it.source !== "web") o.c = 0;
  if (o.f == null && it.source !== "web") o.f = 0;
  if (it.grams) o.grams = it.grams; if (it.note) o.note = it.note; if (it.recipeId) o.recipeId = it.recipeId; if (it.fdcId) o.fdcId = it.fdcId;
  if (it.micros && typeof it.micros === "object") o.micros = JSON.parse(JSON.stringify(it.micros));
  ["webKey", "webSource", "sourceLabel", "sourceId", "sourceUrl", "brand", "lastVerified", "servingLabel", "webBasis", "refreshNote"].forEach(function (k) {
    if (it[k]) o[k] = it[k];
  });
  if (it.webMult != null) o.webMult = it.webMult;
  return o;
}

/* ---------------- food log ---------------- */
var foodInput = $("#food-input"), previewTimer;
function renderPreview() {
  var v = foodInput.value.trim(), el = $("#food-preview");
  if (!v) { el.innerHTML = ""; return; }
  var items = itemsFromText(v);
  el.innerHTML = items.map(function (it) {
    var web = needsOnline(it);
    var cached = web ? findWeb(it.name || it.text) : null;
    var label = (it.qty !== 1 || it.unit ? n1(it.qty) + (it.unit ? " " + it.unit : "") + " \u00d7 " : "") + (cached ? cached.name : it.food);
    var note = "";
    if (cached) note = " \u2014 saved match";
    else if (web) note = state.settings.online ? " \u2014 will look up" : " \u2014 not found, edit after logging";
    return '<div class="it' + (web && !cached ? " miss" : "") + '"><span>' + esc(label + note) + "</span><span>" + (web && !cached ? "?" : n0(cached ? cached.kcal : it.kcal) + " kcal") + "</span></div>";
  }).join("");
}
foodInput.addEventListener("input", function () { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 150); });
function resetWhen() {
  var now = new Date(), day = viewDay && viewDay <= todayKey() ? viewDay : todayKey();
  $("#food-when").value = day + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
}

function commitLog(pid, text, when, items, error) {
  var dest = profileById(pid);
  if (!dest || !canView(dest)) { toast("That profile is locked"); return null; }
  var refreshes = [];
  var entry = { id: uid(), ts: (when || new Date()).toISOString(), text: text, items: items.map(function (it) {
    var refresh = !!it._refresh;
    var c = cleanItem(it);
    if (!c.micros) c.micros = blankMicros();
    if (refresh) refreshes.push(c.webKey);
    return c;
  }) };
  dest.foods.push(entry); save();
  foodInput.value = ""; renderPreview(); resetWhen(); renderAll();
  var t = entryTotals(entry), miss = entry.items.filter(function (i) { return !i.matched; });
  toast("Logged " + (t.kcal == null ? "\u2014" : n0(t.kcal)) + " kcal" + (miss.length ? " \u2014 add macros for " + miss.length + " item(s)" : ""));
  if (error) $("#mic-status").className = "hint warn", $("#mic-status").textContent = error;
  if (miss.length) openEditor(entry.id);
  refreshes.forEach(function (key) { backgroundRefresh(pid, entry.id, key); });
  return entry;
}
function rememberWeb(query, cand) {
  var entry = P.webEntryFromCandidate(query, cand, isoToday());
  upsertWeb(entry);
  save();
  return entry;
}
function attachWeb(it, entry, stale) {
  P.applyCached(it, entry);
  if (stale) it._refresh = true;
  return it;
}
function resolveForLog(items) {
  var err = null;
  var chain = Promise.resolve();
  items.forEach(function (it, idx) {
    chain = chain.then(function () {
      if (!needsOnline(it)) return;
      var name = it.name || it.text;
      var cached = findWeb(name);
      if (cached && monthsBetween(cached.lastVerified) <= 6) { attachWeb(it, cached, false); return; }
      if (cached && monthsBetween(cached.lastVerified) > 6) { attachWeb(it, cached, true); return; }
      if (!state.settings.online || !navigator.onLine) return;
      var brand = P.detectBrand(name);
      function picked(cands, whichBrand, error) {
        if (error) err = error;
        return askMatch(it, cands || [], whichBrand, err).then(function (ok) { if (!ok) throw new Error("cancel"); });
      }
      if (brand || P.localMissesBrand(it)) {
        return P.searchWeb(name, fdcKey()).then(function (res) {
          return picked(res.candidates, res.brand, res.error);
        }).catch(function (e) {
          if (e && e.message === "cancel") throw e;
          return picked([], brand, e.message);
        });
      }
      return P.usdaSearch(name, fdcKey()).then(function (res) {
        if (res) { var keepGuess = it.source === "db"; P.applyUsda(it, res); if (keepGuess) it.note += " (local guess replaced)"; return; }
        return P.searchWeb(name, fdcKey()).then(function (found) { return picked(found.candidates, found.brand, found.error); });
      }).catch(function (e) {
        if (e && e.message === "cancel") throw e;
        return picked([], null, e.message);
      });
    });
  });
  return chain.then(function () { return { items: items, error: err }; });
}
function logFood(text, when) {
  text = (text || "").trim();
  if (!text) { toast("Type or say what you ate"); return Promise.resolve(null); }
  var pid = current().id;
  var btn = $("#food-log"); btn.disabled = true; btn.textContent = "Looking up\u2026";
  var items = itemsFromText(text);
  return resolveForLog(items).then(function (r) {
    return commitLog(pid, text, when, r.items, r.error);
  }).catch(function (e) {
    if (e && e.message === "cancel") { toast("Didn't log that"); return null; }
    toast(e && e.message ? e.message : "Lookup failed");
    return null;
  }).finally(function () { btn.disabled = false; btn.textContent = "Log it"; });
}
$("#food-form").addEventListener("submit", function (e) { e.preventDefault(); logFood(foodInput.value, fromLocalInput($("#food-when").value)); });
setupMic($("#food-mic"), $("#mic-status"), function (t) { foodInput.value = t; renderPreview(); },
  function (t) { foodInput.value = t; renderPreview(); logFood(t, fromLocalInput($("#food-when").value)); });

function logRecipe(id, qty, when) {
  var r = state.recipes.filter(function (x) { return x.id === id; })[0];
  qty = +qty || 1; if (!r) return null;
  var dest = current();
  if (!canView(dest)) { toast("That profile is locked"); return null; }
  var ps = r.perServing || { kcal: 0, p: 0, c: 0, f: 0 };
  var label = r.name + " (" + n1(qty) + (qty === 1 ? " serving)" : " servings)");
  var entry = { id: uid(), ts: (when || new Date()).toISOString(), text: label, items: [{ text: label, qty: qty, unit: "serving", food: label, source: "recipe",
    recipeId: r.id, matched: true, kcal: Math.round(ps.kcal * qty), p: P.round1(ps.p * qty), c: P.round1(ps.c * qty), f: P.round1(ps.f * qty),
    micros: P.scaleMicros(ps.micros, qty) || blankMicros() }] };
  dest.foods.push(entry); save(); renderAll(); toast("Logged " + label + " \u2014 " + n0(entry.items[0].kcal) + " kcal");
  return entry;
}
$("#rq-log").addEventListener("click", function () { var id = $("#rq-select").value; if (id) logRecipe(id, $("#rq-qty").value, fromLocalInput($("#food-when").value)); });

function kcalText(v) { return v == null ? "\u2014" : n0(v); }
function macroBits(i) {
  return kcalText(i.kcal) + " kcal \u00b7 " + (i.p == null ? "\u2014" : n1(i.p)) + "/" + (i.c == null ? "\u2014" : n1(i.c)) + "/" + (i.f == null ? "\u2014" : n1(i.f));
}
function verifiedHTML(i) {
  if (i.source !== "web" || !i.lastVerified) return "";
  return '<div class="verified" data-verified="1">Verified ' + esc(i.lastVerified) + " via " + esc(i.sourceLabel || "web") +
    (i.refreshNote ? ' <span class="refresh-note">' + esc(i.refreshNote) + "</span>" : "") + "</div>";
}
var FOOD_PAGE = 14, foodShown = FOOD_PAGE, foodFor = null;
function entryHTML(e, compact) {
  var t = entryTotals(e);
  if (compact) return '<li class="tentry" data-id="' + e.id + '"><div class="top"><div><div class="t">' + esc(e.text) + '</div><div class="m">' + fmtTime(e.ts) + " \u00b7 P " + n0(t.p) + " C " + n0(t.c) + " F " + n0(t.f) +
    e.items.map(verifiedHTML).join("") + '</div></div><div class="k">' + kcalText(t.kcal) + " kcal</div></div><div class=\"acts\"><button type=\"button\" data-act=\"edit\">Edit</button><button type=\"button\" data-act=\"del\" class=\"del\">Delete</button></div></li>";
  return '<div class="entry" data-id="' + e.id + '"><div class="top"><div><div class="t"><b>' + esc(e.text) + '</b></div><div class="when">' + fmtTime(e.ts) + '</div></div><div class="k"><b>' + kcalText(t.kcal) + ' kcal</b><div class="macros">P ' + n1(t.p) + " \u00b7 C " + n1(t.c) + " \u00b7 F " + n1(t.f) + "</div></div></div>" +
    '<ul class="items">' + e.items.map(function (i, idx) {
      var refresh = (i.source === "web" && i.webSource && i.webSource !== "manual") ? '<button type="button" data-act="refresh" data-idx="' + idx + '">Refresh</button>' : "";
      return '<li class="' + (i.matched ? "" : "miss") + '"><div class="irow"><span>' + esc(i.food) + (i.matched ? "" : " \u2014 needs macros") + (i.servingLabel ? " \u00b7 " + esc(i.servingLabel) : "") + "</span><span>" + macroBits(i) + "</span></div>" + verifiedHTML(i) + refresh + "</li>";
    }).join("") + '</ul><div class="acts"><button data-act="edit">Edit</button><button data-act="del" class="del">Delete</button></div></div>';
}
function renderFood() {
  var prof = current();
  if (foodFor !== prof.id) { foodFor = prof.id; foodShown = FOOD_PAGE; }
  var foods = prof.foods;
  var byDay = {};
  foods.forEach(function (e) { (byDay[dayKey(e.ts)] = byDay[dayKey(e.ts)] || []).push(e); });
  var minK = earliestKey(), today = todayKey();
  var days = Object.keys(byDay).filter(function (k) { return k >= minK && k <= today; }).sort().reverse();
  if (days.length > 365) days = days.slice(0, 365);
  var visible = days.slice(0, foodShown);
  var html = days.length ? "" : '<div class="card"><div class="empty">No food logged yet. Try typing \u201ctwo eggs and toast\u201d.</div></div>';
  visible.forEach(function (k) {
    var list = byDay[k].sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); }), t = dayTotals(k);
    var mode = dayNut[k] || "macros";
    var items = [].concat.apply([], list.map(function (e) { return e.items; }));
    html += '<div class="card day" data-day="' + k + '"><h3><span>' + fmtDay(k) + '</span><span>' + n0(t.kcal) + ' kcal</span></h3>' +
      '<div class="toggle mini"><button type="button" data-nut="macros"' + (mode === "macros" ? ' class="active"' : "") + '>Macros</button><button type="button" data-nut="nutrients"' + (mode === "nutrients" ? ' class="active"' : "") + '>Nutrients</button></div>' +
      (mode === "nutrients" ? '<div class="nut-day">' + nutrientHTML(items, current(), true) + "</div>" : '<div class="tot">Protein ' + n1(t.p) + " g \u00b7 Carbs " + n1(t.c) + " g \u00b7 Fat " + n1(t.f) + " g</div>") +
      list.map(function (e) { return entryHTML(e); }).join("") + "</div>";
  });
  if (visible.length < days.length) html += '<div class="card food-more"><button type="button" class="btn ghost wide" id="food-more">Show older days</button></div>';
  $("#food-days").innerHTML = html;
  var sel = $("#rq-select"), cur = sel.value;
  $("#recipe-quick").hidden = !state.recipes.length;
  sel.innerHTML = state.recipes.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (r) {
    return '<option value="' + r.id + '">' + esc(r.name) + " \u2014 " + n0(r.perServing && r.perServing.kcal) + " kcal/srv</option>"; }).join("");
  if (cur) sel.value = cur;
}
$("#food-days").addEventListener("click", function (ev) {
  if (ev.target.closest("#food-more")) { foodShown += 30; renderFood(); return; }
  var nb = ev.target.closest("button[data-nut]");
  if (nb) { var card = nb.closest(".day"); if (card) { dayNut[card.dataset.day] = nb.dataset.nut; renderFood(); } return; }
  var b = ev.target.closest("button[data-act]"); if (!b) return;
  var id = b.closest(".entry").dataset.id;
  var prof = current();
  if (b.dataset.act === "refresh") { manualRefresh(prof.id, id, +b.dataset.idx); return; }
  if (b.dataset.act === "del") { if (confirm("Delete this entry?")) { prof.foods = prof.foods.filter(function (e) { return e.id !== id; }); save(); renderAll(); } }
  else openEditor(id);
});
var foodScrollAt = 0;
window.addEventListener("scroll", function () {
  var more = $("#food-more"), view = $("#view-food");
  if (!more || !view || !view.classList.contains("active")) return;
  var now = Date.now();
  if (now - foodScrollAt < 280) return;
  var r = more.getBoundingClientRect();
  if (r.top < window.innerHeight + 160 && r.bottom > 0) { foodScrollAt = now; foodShown += 30; renderFood(); }
}, { passive: true });

/* ---------------- web match, label, refresh ---------------- */
var matchResolve = null, matchItem = null, matchCands = [], pendingDiff = null;
function webDialog() { return $("#web-dialog"); }
function hideWeb() {
  var dlg = webDialog();
  if (!dlg) return;
  if (dlg.open && dlg.close) dlg.close();
  else dlg.removeAttribute("open");
  var body = $("#web-dialog-body");
  if (body) body.innerHTML = "";
}
function closeWeb(ok) {
  var fn = matchResolve;
  matchResolve = null;
  matchItem = null;
  hideWeb();
  if (fn) fn(!!ok);
}
function showWeb() {
  var dlg = webDialog();
  if (!dlg) return;
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}
function manualFieldsHTML(name) {
  var micros = P.MICRO_KEYS.map(function (k) {
    var label = { fiber: "Fiber g", sugar: "Sugar g", sodium: "Sodium mg", potassium: "Potassium mg", calcium: "Calcium mg", iron: "Iron mg", magnesium: "Magnesium mg", vita: "Vit A µg", vitc: "Vit C mg", vitd: "Vit D µg", b12: "B12 µg" }[k];
    return '<label>' + label + '<input data-micro="' + k + '" type="number" step="any" min="0" inputmode="decimal" placeholder="unknown"></label>';
  }).join("");
  return '<form id="label-form"><p class="hint">Type the label for <b>' + esc(name) + '</b>. Leave a box empty when the label doesn\'t list it. Empty means unknown, not zero.</p>' +
    '<label>Name on the label<input id="label-name" required value="' + esc(name) + '"></label>' +
    '<div class="grid2"><label>Serving<input id="label-serving" placeholder="1 package"></label><label>Grams<input id="label-grams" type="number" min="0" step="any" inputmode="decimal"></label></div>' +
    '<div class="grid2"><label>Calories<input id="label-kcal" type="number" min="0" step="any" inputmode="decimal"></label><label>Protein g<input id="label-p" type="number" min="0" step="any" inputmode="decimal"></label>' +
    '<label>Carbs g<input id="label-c" type="number" min="0" step="any" inputmode="decimal"></label><label>Fat g<input id="label-f" type="number" min="0" step="any" inputmode="decimal"></label></div>' +
    '<details><summary>Other nutrients, if the label has them</summary><div class="grid2">' + micros + '</div></details>' +
    '<div class="row end"><button class="btn ghost" type="button" id="match-cancel">Cancel</button><button class="btn" type="submit">Save and log</button></div></form>';
}
function renderMatch(it, candidates, brand, err) {
  var q = it.name || it.text;
  var body = $("#web-dialog-body");
  var html = "<h2>Which one?</h2><p class=\"hint\">" + esc(q) + "</p>";
  if (brand) html += '<p class="hint">Preferring ' + esc(brand.name) + '. Public databases often have the packaged food or an older menu item, not the current restaurant build.</p>';
  if (err) html += '<p class="hint warn">' + esc(err) + "</p>";
  if (!candidates.length) {
    html += manualFieldsHTML(q);
    body.innerHTML = html;
    webDialog().dataset.mode = "manual";
    return;
  }
  html += '<div class="match-list">' + candidates.map(function (c, i) {
    var grams = c.grams >= 5 ? c.grams : 100;
    var kcal = c.per100 && c.per100.kcal != null ? Math.round(c.per100.kcal * grams / 100) : null;
    return '<button type="button" class="match-opt" data-pick="' + i + '"><b>' + esc(c.name) + "</b><span>" + esc(c.sourceLabel) + (c.brand ? " · " + esc(c.brand) : "") + "</span><span>" +
      esc(c.servingLabel || (Math.round(grams) + " g")) + " · " + (kcal == null ? "\u2014" : kcal + " kcal") + "</span></button>";
  }).join("") + '</div><div class="row wrap"><button type="button" class="btn ghost" id="match-manual">None of these — enter the label</button><button type="button" class="btn ghost" id="match-cancel">Cancel</button></div>';
  body.innerHTML = html;
  webDialog().dataset.mode = "match";
}
function askMatch(it, candidates, brand, err) {
  matchItem = it;
  matchCands = candidates || [];
  return new Promise(function (resolve) {
    matchResolve = resolve;
    renderMatch(it, matchCands, brand, err);
    showWeb();
  });
}
function readOpt(id) {
  var el = $(id);
  if (!el || el.value.trim() === "") return null;
  var n = +el.value;
  return isNaN(n) ? null : n;
}
function rememberManual(query) {
  var grams = readOpt("#label-grams");
  var micros = blankMicros();
  $$("#label-form [data-micro]").forEach(function (el) {
    micros[el.dataset.micro] = el.value.trim() === "" ? null : +el.value;
  });
  var kcal = readOpt("#label-kcal"), p = readOpt("#label-p"), c = readOpt("#label-c"), f = readOpt("#label-f");
  var per = null;
  if (grams >= 5) {
    function up(v) { return v == null ? null : v * 100 / grams; }
    per = { kcal: up(kcal), p: up(p), c: up(c), f: up(f), micros: P.scaleMicros(micros, 100 / grams) };
  }
  var entry = {
    key: P.keyOf(query), query: query, source: "manual", sourceLabel: "nutrition label", sourceId: "", sourceUrl: "",
    name: $("#label-name").value.trim() || query, brand: "", servingLabel: $("#label-serving").value.trim() || (grams ? grams + " g" : "1 serving"),
    grams: grams, pieceCount: null, kcal: kcal, p: p, c: c, f: f, micros: micros, per100: per, lastVerified: isoToday()
  };
  upsertWeb(entry);
  save();
  return entry;
}
function onWebClick(ev) {
  var pick = ev.target.closest("[data-pick]");
  if (pick && matchItem) {
    var cand = matchCands[+pick.dataset.pick];
    var query = matchItem.name || matchItem.text;
    var item = matchItem;
    P.refineUsdaCandidate(cand, fdcKey()).then(function (ready) {
      attachWeb(item, rememberWeb(query, ready), false);
      closeWeb(true);
    }).catch(function (e) { toast(e.message || "Couldn't use that match"); });
    return;
  }
  if (ev.target.id === "match-manual" && matchItem) {
    $("#web-dialog-body").innerHTML = "<h2>Nutrition label</h2>" + manualFieldsHTML(matchItem.name || matchItem.text);
    webDialog().dataset.mode = "manual";
    return;
  }
  if (ev.target.id === "match-cancel") { closeWeb(false); return; }
  if (ev.target.id === "diff-cancel") { pendingDiff = null; hideWeb(); return; }
  if (ev.target.id === "diff-accept") acceptDiff();
}
function onWebSubmit(ev) {
  ev.preventDefault();
  if (!matchItem) return;
  var item = matchItem;
  var entry = rememberManual(item.name || item.text);
  attachWeb(item, entry, false);
  closeWeb(true);
}
function diffNum(v) { return v == null || v === "" ? "\u2014" : (Math.round(+v * 100) / 100).toString(); }
function renderDiff() {
  var d = pendingDiff;
  var rows = [
    ["Calories", d.prev.kcal, d.next.kcal],
    ["Protein (g)", d.prev.p, d.next.p],
    ["Carbs (g)", d.prev.c, d.next.c],
    ["Fat (g)", d.prev.f, d.next.f]
  ];
  var labels = { fiber: "Fiber (g)", sugar: "Sugar (g)", sodium: "Sodium (mg)", potassium: "Potassium (mg)", calcium: "Calcium (mg)", iron: "Iron (mg)", magnesium: "Magnesium (mg)", vita: "Vitamin A (µg)", vitc: "Vitamin C (mg)", vitd: "Vitamin D (µg)", b12: "Vitamin B12 (µg)" };
  P.MICRO_KEYS.forEach(function (k) {
    rows.push([labels[k], d.prev.micros ? d.prev.micros[k] : null, d.next.micros ? d.next.micros[k] : null]);
  });
  var html = "<h2>Refresh this entry?</h2><p class=\"hint\">" + esc(d.next.food) + " · " + esc(d.fresh.sourceLabel) + ". Accepting updates this entry and the saved lookup. Other days stay as they were.</p>" +
    '<table class="diff"><tr><th>Nutrient</th><th>Now</th><th>From source</th></tr>' +
    rows.map(function (r) {
      var changed = diffNum(r[1]) !== diffNum(r[2]);
      return "<tr" + (changed ? ' class="chg"' : "") + "><td>" + r[0] + "</td><td>" + diffNum(r[1]) + "</td><td>" + diffNum(r[2]) + "</td></tr>";
    }).join("") + '</table><div class="row end"><button type="button" class="btn ghost" id="diff-cancel">Keep current</button><button type="button" class="btn" id="diff-accept">Accept change</button></div>';
  $("#web-dialog-body").innerHTML = html;
  webDialog().dataset.mode = "diff";
  showWeb();
}
function acceptDiff() {
  var d = pendingDiff;
  if (!d) return;
  upsertWeb(d.fresh);
  var prof = profileById(d.pid);
  var entry = prof && prof.foods.filter(function (e) { return e.id === d.entryId; })[0];
  if (entry && entry.items[d.idx]) {
    var cleaned = cleanItem(d.next);
    delete cleaned.refreshNote;
    entry.items[d.idx] = cleaned;
  }
  if (d.fromEdit && editing && editing.id === d.entryId) {
    editing.items = readEditItems();
    if (editing.items[d.idx]) editing.items[d.idx] = cleanItem(d.next);
    renderEditItems(editing.items);
  }
  pendingDiff = null;
  save(); renderAll(); hideWeb();
  toast("Updated this entry");
}
function manualRefresh(pid, entryId, idx, fromEdit) {
  var prof = profileById(pid);
  var entry = prof && prof.foods.filter(function (e) { return e.id === entryId; })[0];
  var item = entry && entry.items[idx];
  if (!item || item.webSource === "manual") { toast("That one was typed from a label"); return; }
  var cached = state.webFoods.filter(function (w) { return w.key === item.webKey; })[0];
  if (!cached) { toast("No saved lookup for that food"); return; }
  if (!navigator.onLine) { toast("Couldn't refresh"); return; }
  toast("Checking " + (cached.sourceLabel || "the source") + "…");
  P.refetchWeb(cached, fdcKey()).then(function (cand) {
    if (!cand) { toast("Couldn't refresh"); return; }
    var fresh = P.webEntryFromCandidate(cached.query || cached.key, cand, isoToday());
    fresh.key = cached.key;
    var next = Object.assign({}, item);
    P.applyCached(next, fresh);
    pendingDiff = { pid: pid, entryId: entryId, idx: idx, fromEdit: !!fromEdit, fresh: fresh, next: next, prev: item };
    renderDiff();
  }).catch(function () { toast("Couldn't refresh"); });
}
function backgroundRefresh(pid, entryId, webKey) {
  var cached = state.webFoods.filter(function (w) { return w.key === webKey; })[0];
  function mark() {
    var prof = profileById(pid);
    var entry = prof && prof.foods.filter(function (e) { return e.id === entryId; })[0];
    if (!entry) return;
    entry.items.forEach(function (it) { if (it.webKey === webKey) it.refreshNote = "couldn't refresh"; });
    save(); renderAll();
  }
  if (!cached || cached.source === "manual") return;
  if (!state.settings.online || !navigator.onLine) { mark(); return; }
  P.refetchWeb(cached, fdcKey()).then(function (cand) {
    if (!cand) { mark(); return; }
    var fresh = P.webEntryFromCandidate(cached.query || cached.key, cand, isoToday());
    fresh.key = cached.key;
    upsertWeb(fresh);
    var prof = profileById(pid);
    var entry = prof && prof.foods.filter(function (e) { return e.id === entryId; })[0];
    if (entry) entry.items.forEach(function (it) {
      if (it.webKey !== webKey) return;
      var copy = Object.assign({}, it);
      P.applyCached(copy, fresh);
      var cleaned = cleanItem(copy);
      delete cleaned.refreshNote;
      entry.items[entry.items.indexOf(it)] = cleaned;
    });
    save(); renderAll();
  }).catch(function () { mark(); });
}

(function () {
  var dlg = webDialog();
  if (!dlg) return;
  dlg.addEventListener("click", onWebClick);
  dlg.addEventListener("submit", onWebSubmit);
  dlg.addEventListener("cancel", function (ev) {
    ev.preventDefault();
    if (dlg.dataset.mode === "diff") { pendingDiff = null; hideWeb(); return; }
    closeWeb(false);
  });
})();

/* ---------------- edit dialog ---------------- */
var dlg = $("#edit-dialog"), editing = null, editingProfileId = null;
function itemRow(i, idx) {
  var web = (i.source === "web" && i.lastVerified) ? '<div class="eweb">' + verifiedHTML(i) +
    (i.webSource && i.webSource !== "manual" ? '<button type="button" class="refresh" data-idx="' + idx + '">Refresh</button>' : "") + "</div>" : "";
  return '<div class="eitem-wrap"><div class="eitem"><input class="e-name" value="' + esc(i.food) + '" aria-label="Item">' +
    ["kcal", "p", "c", "f"].map(function (k) { return '<input class="e-' + k + '" type="number" step="any" min="0" inputmode="decimal" value="' + (i[k] == null ? "" : (k === "kcal" ? n0(i[k]) : n1(i[k]))) + '" aria-label="' + k + '">'; }).join("") +
    '<button type="button" class="x" aria-label="Remove item">\u00d7</button></div>' + web + "</div>";
}
function renderEditItems(items) {
  $("#e-items").innerHTML = '<div class="ehead"><span>Item</span><span>kcal</span><span>Prot g</span><span>Carb g</span><span>Fat g</span><span></span></div>' + items.map(itemRow).join("");
}
function readEditItems() {
  return $$("#e-items .eitem").map(function (row, idx) {
    var base = (editing.items[idx]) || {};
    var name = $(".e-name", row).value.trim() || "Item";
    var o = Object.assign({}, base, { food: name, kcal: +$(".e-kcal", row).value || 0, p: +$(".e-p", row).value || 0, c: +$(".e-c", row).value || 0, f: +$(".e-f", row).value || 0 });
    if (!base.text) { o.text = name; o.qty = 1; o.source = "manual"; }
    if (o.kcal || o.p || o.c || o.f) o.matched = true;
    if (base.food !== name || base.kcal !== o.kcal || base.p !== o.p || base.c !== o.c || base.f !== o.f) {
      if (base.source && base.source !== "manual") o.note = (base.note ? base.note + "; " : "") + "edited";
      if (base.matched === false) o.source = "manual";
      o.micros = blankMicros();
    }
    return o;
  });
}
function openEditor(id) {
  var prof = current();
  var e = prof.foods.filter(function (x) { return x.id === id; })[0]; if (!e) return;
  editing = JSON.parse(JSON.stringify(e));
  editingProfileId = prof.id;
  $("#e-text").value = e.text; $("#e-when").value = toLocalInput(e.ts);
  renderEditItems(editing.items);
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  var miss = $$("#e-items .eitem").filter(function (r, i) { return !editing.items[i].matched; })[0];
  if (miss) setTimeout(function () { $(".e-kcal", miss).select(); }, 60);
}
$("#e-items").addEventListener("click", function (ev) {
  var refresh = ev.target.closest("button.refresh");
  if (refresh && editing) { manualRefresh(editingProfileId, editing.id, +refresh.dataset.idx, true); return; }
  if (!ev.target.classList.contains("x")) return;
  var rows = $$("#e-items .eitem"), idx = rows.indexOf(ev.target.closest(".eitem"));
  editing.items = readEditItems(); editing.items.splice(idx, 1); renderEditItems(editing.items);
});
$("#e-additem").addEventListener("click", function () { editing.items = readEditItems(); editing.items.push({ food: "", kcal: 0, p: 0, c: 0, f: 0, matched: false }); renderEditItems(editing.items); });
$("#e-reparse").addEventListener("click", function () {
  var b = this; b.disabled = true;
  resolveForLog(itemsFromText($("#e-text").value)).then(function (r) {
    editing.items = r.items.map(function (it) { var c = cleanItem(it); if (!c.micros) c.micros = blankMicros(); return c; });
    renderEditItems(editing.items);
  }).catch(function () {}).finally(function () { b.disabled = false; });
});
$("#edit-form").addEventListener("submit", function (ev) {
  if (ev.submitter && ev.submitter.value !== "save") { editing = null; return; }
  var items = readEditItems().filter(function (i) { return i.food; });
  var prof = profileById(editingProfileId);
  if (!prof || !canView(prof)) { toast("That profile is locked"); editing = null; return; }
  var idx = prof.foods.findIndex(function (x) { return x.id === editing.id; });
  if (idx >= 0) {
    prof.foods[idx] = Object.assign(prof.foods[idx], { text: $("#e-text").value.trim() || prof.foods[idx].text, ts: fromLocalInput($("#e-when").value).toISOString(), items: items.map(cleanItem) });
    save(); renderAll(); toast("Entry updated");
  }
  editing = null;
});

/* ---------------- today ---------------- */
var NUTRIENTS = [
  { k: "fiber", label: "Fiber", unit: "g" },
  { k: "sugar", label: "Total sugar", unit: "g" },
  { k: "sodium", label: "Sodium", unit: "mg" },
  { k: "potassium", label: "Potassium", unit: "mg" },
  { k: "calcium", label: "Calcium", unit: "mg" },
  { k: "iron", label: "Iron", unit: "mg" },
  { k: "magnesium", label: "Magnesium", unit: "mg" },
  { k: "vita", label: "Vitamin A", unit: "\u00b5g" },
  { k: "vitc", label: "Vitamin C", unit: "mg" },
  { k: "vitd", label: "Vitamin D", unit: "\u00b5g" },
  { k: "b12", label: "Vitamin B12", unit: "\u00b5g" }
];
var todayNut = "macros";
var dayNut = {};
function targetFor(key, age, sex) {
  var f = sex === "female";
  if (key === "sugar") return 50;
  if (key === "sodium") { if (age <= 3) return 1200; if (age <= 8) return 1500; if (age <= 13) return 1800; return 2300; }
  if (key === "fiber") { if (age <= 3) return 19; if (age <= 8) return 25; if (age <= 13) return f ? 26 : 31; if (age <= 18) return f ? 26 : 38; if (age <= 50) return f ? 25 : 38; return f ? 21 : 30; }
  if (key === "potassium") { if (age <= 3) return 2000; if (age <= 8) return 2300; if (age <= 13) return f ? 2300 : 2500; if (age <= 18) return f ? 2300 : 3000; return f ? 2600 : 3400; }
  if (key === "calcium") { if (age <= 3) return 700; if (age <= 8) return 1000; if (age <= 18) return 1300; if (age <= 50) return 1000; if (age <= 70) return f ? 1200 : 1000; return 1200; }
  if (key === "iron") { if (age <= 3) return 7; if (age <= 8) return 10; if (age <= 13) return 8; if (age <= 18) return f ? 15 : 11; if (age <= 50) return f ? 18 : 8; return 8; }
  if (key === "magnesium") { if (age <= 3) return 80; if (age <= 8) return 130; if (age <= 13) return 240; if (age <= 18) return f ? 360 : 410; if (age <= 30) return f ? 310 : 400; return f ? 320 : 420; }
  if (key === "vita") { if (age <= 3) return 300; if (age <= 8) return 400; if (age <= 13) return 600; return f ? 700 : 900; }
  if (key === "vitc") { if (age <= 3) return 15; if (age <= 8) return 25; if (age <= 13) return 45; if (age <= 18) return f ? 65 : 75; return f ? 75 : 90; }
  if (key === "vitd") return age >= 71 ? 20 : 15;
  if (key === "b12") { if (age <= 3) return 0.9; if (age <= 8) return 1.2; if (age <= 13) return 1.8; return 2.4; }
  return 0;
}
function nNut(k, v) {
  if (v == null || isNaN(+v)) return "\u2014";
  if (k === "b12" || k === "vitd") return (Math.round(+v * 100) / 100).toString();
  if (k === "iron" || k === "vitc" || k === "fiber" || k === "sugar") return (Math.round(+v * 10) / 10).toString();
  return Math.round(+v).toString();
}
function nutrientHTML(items, prof, compact) {
  var bag = P.collectMicros(items), demo = demoOf(prof);
  var html = "";
  if (demo.assumed) html += '<p class="hint warn" data-demo-prompt="1">Set ' + esc(prof.name) + "'s age for accurate targets</p>";
  if (bag.legacy) html += '<p class="hint warn" data-legacy="1">Incomplete \u2014 some entries logged before nutrient tracking</p>';
  html += NUTRIENTS.map(function (n) {
    var a = bag.acc[n.k], goal = targetFor(n.k, demo.age, demo.sex);
    var known = a.known > 0, incomplete = a.missing > 0;
    var val = known ? a.sum : null;
    var pct = val == null || !(goal > 0) ? 0 : Math.min(100, val / goal * 100);
    var over = n.k === "sodium" && val != null && val > goal;
    var right = (val == null ? "\u2014" : nNut(n.k, val)) + " / " + nNut(n.k, goal) + " " + n.unit + (val == null ? "" : " \u00b7 " + Math.round(val / goal * 100) + "%");
    var flag = incomplete ? ' <span class="muted">incomplete</span>' : "";
    return '<div class="bar' + (over ? " over" : "") + '" data-nutrient="' + n.k + '"><div class="bar-top"><span><b>' + n.label + "</b>" + flag + "</span><span>" + right + '</span></div><div class="track"><div class="fill" style="width:' + pct.toFixed(1) + "%;background:" + (over ? "var(--warn)" : "var(--forest)") + '"></div></div></div>';
  }).join("");
  html += compact
    ? '<p class="hint source-note">USDA FoodData Central. Targets: NIH ODS / National Academies DRIs.</p>'
    : '<p class="hint source-note">Targets are NIH Office of Dietary Supplements / National Academies DRIs (RDA or AI). Sodium uses the chronic disease risk reduction level as an upper target (2,300 mg from age 14, lower for children). Sugar uses the FDA 50 g Daily Value for added sugar; the amount here is total sugar. Food values are USDA FoodData Central.</p>';
  return html;
}
function bar(label, val, goal, color, unit) {
  var pct = goal > 0 ? Math.min(100, val / goal * 100) : 0;
  return '<div class="bar"><div class="bar-top"><span><b>' + label + '</b></span><span>' + n0(val) + " / " + n0(goal) + " " + unit + '</span></div><div class="track"><div class="fill" style="width:' + pct.toFixed(1) + "%;background:" + (val > goal * 1.05 ? "var(--warn)" : color) + '"></div></div></div>';
}
var HISTORY_DAYS = 365;
var viewDay = null, viewFor = null, calMonth = null, trendRange = 90, trendPlots = [], trendX = {};
function addDays(key, n) {
  var d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
function earliestKey() { return addDays(todayKey(), 1 - HISTORY_DAYS); }
function selectedDay() {
  var id = current().id;
  if (viewFor !== id) { viewFor = id; viewDay = todayKey(); calMonth = null; closeCal(); resetWhen(); }
  if (!viewDay || viewDay > todayKey()) viewDay = todayKey();
  if (viewDay < earliestKey()) viewDay = earliestKey();
  return viewDay;
}
function setViewDay(key) {
  var today = todayKey(), min = earliestKey();
  if (!key || key > today) key = today;
  if (key < min) key = min;
  viewFor = current().id;
  viewDay = key;
  calMonth = key.slice(0, 7);
  resetWhen();
  renderToday();
}
function shiftDay(n) {
  var next = addDays(selectedDay(), n), min = earliestKey(), today = todayKey();
  if (next < min || next > today) return;
  setViewDay(next);
}
function loggedDays() {
  var days = {};
  current().foods.forEach(function (e) { days[dayKey(e.ts)] = 1; });
  return days;
}
function renderCal() {
  var key = selectedDay();
  if (!calMonth) calMonth = key.slice(0, 7);
  var year = +calMonth.slice(0, 4), month = +calMonth.slice(5, 7) - 1;
  var first = new Date(year, month, 1), startDow = first.getDay();
  var daysIn = new Date(year, month + 1, 0).getDate();
  var logged = loggedDays(), today = todayKey(), min = earliestKey();
  var html = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(function (d) { return '<span class="dow">' + d + "</span>"; }).join("");
  for (var i = 0; i < startDow; i++) html += "<span></span>";
  for (var d = 1; d <= daysIn; d++) {
    var k = year + "-" + pad(month + 1) + "-" + pad(d);
    var cls = "cal-day" + (k === key ? " on" : "") + (k === today ? " today" : "") + (logged[k] ? " has" : "");
    html += '<button type="button" class="' + cls + '" data-day="' + k + '"' + (k > today || k < min ? " disabled" : "") + ">" + d + (logged[k] ? "<i></i>" : "") + "</button>";
  }
  $("#cal-grid").innerHTML = html;
  $("#cal-title").textContent = first.toLocaleDateString([], { month: "long", year: "numeric" });
  $("#cal-next").disabled = calMonth >= today.slice(0, 7);
  $("#cal-prev").disabled = calMonth <= min.slice(0, 7);
  var pick = $("#day-input");
  pick.min = min;
  pick.max = today;
  pick.value = key;
}
function openCal() {
  calMonth = selectedDay().slice(0, 7);
  $("#cal").hidden = false;
  $("#day-label").setAttribute("aria-expanded", "true");
  renderCal();
}
function closeCal() {
  $("#cal").hidden = true;
  $("#day-label").setAttribute("aria-expanded", "false");
}
function daySpan(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }
function trendSeries() {
  var by = {}, today = todayKey(), min = earliestKey();
  var start = addDays(today, 1 - trendRange);
  if (start < min) start = min;
  current().foods.forEach(function (e) {
    var k = dayKey(e.ts);
    if (k < start || k > today) return;
    (by[k] = by[k] || []).push(e);
  });
  return Object.keys(by).sort().map(function (k) {
    var items = [].concat.apply([], by[k].map(function (e) { return e.items; }));
    var t = P.totals(items);
    return { date: k, kcal: t.kcal, p: t.p, c: t.c, f: t.f };
  });
}
function trendChart(points, key, goal, color, unit) {
  var W = 360, H = 132, pl = 36, pr = 8, pt = 16, pb = 22;
  if (!points.length) return "";
  var vals = points.map(function (p) { return +p[key] || 0; }).concat([+goal || 0]);
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (hi === lo) { lo = Math.max(0, lo - 1); hi = hi + 1; }
  var padV = Math.max(hi - lo, 1) * 0.12;
  lo = Math.max(0, lo - padV); hi = hi + padV;
  var t0 = new Date(points[0].date + "T12:00:00").getTime(), t1 = new Date(points[points.length - 1].date + "T12:00:00").getTime();
  function x(d) { var t = new Date(d + "T12:00:00").getTime(); return t1 === t0 ? pl + (W - pl - pr) / 2 : pl + (t - t0) / (t1 - t0) * (W - pl - pr); }
  function y(v) { return pt + (hi - v) / (hi - lo) * (H - pt - pb); }
  trendX = {};
  points.forEach(function (p) { trendX[p.date] = x(p.date); });
  var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" data-key="' + key + '" data-unit="' + unit + '">';
  s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(goal) + '" y2="' + y(goal) + '" stroke="#1F5C45" stroke-width="1.4" stroke-dasharray="6 4" opacity=".8"/>';
  s += '<text x="' + (W - pr) + '" y="' + Math.max(11, y(goal) - 4) + '" text-anchor="end" font-size="11" font-weight="600" fill="#1F5C45">Goal ' + n0(goal) + "</text>";
  var seg = [];
  function drawSeg() {
    if (seg.length > 1) s += '<polyline points="' + seg.map(function (p) { return x(p.date).toFixed(1) + "," + y(+p[key] || 0).toFixed(1); }).join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
    seg = [];
  }
  points.forEach(function (p, i) {
    if (i && daySpan(points[i - 1].date, p.date) > 1) drawSeg();
    seg.push(p);
  });
  drawSeg();
  var span = Math.max(1, points.length - 1), spacing = (W - pl - pr) / span, dense = spacing < 12;
  points.forEach(function (p) {
    var tip = fmtShort(p.date) + ": " + n0(p[key]) + " " + unit;
    if (!dense) s += '<circle class="hit" cx="' + x(p.date).toFixed(1) + '" cy="' + y(+p[key] || 0).toFixed(1) + '" r="11" fill="transparent" data-tip="' + esc(tip) + '" tabindex="0"><title>' + esc(tip) + "</title></circle>";
    s += '<circle cx="' + x(p.date).toFixed(1) + '" cy="' + y(+p[key] || 0).toFixed(1) + '" r="' + (dense ? 2 : 3.5) + '" fill="' + color + '" stroke="#FBFAF7" stroke-width="1.5" pointer-events="none"/>';
  });
  var ticks = [], seen = {};
  points.forEach(function (p) { var m = p.date.slice(0, 7); if (!seen[m]) { seen[m] = 1; ticks.push(p); } });
  var step = ticks.length > 7 ? 2 : 1, shown = [];
  for (var ti = 0; ti < ticks.length; ti += step) shown.push(ticks[ti]);
  if (ticks.length && shown[shown.length - 1] !== ticks[ticks.length - 1]) shown.push(ticks[ticks.length - 1]);
  var keep = [];
  shown.forEach(function (p, n) {
    var xx = x(p.date);
    if (keep.length && Math.abs(xx - keep[keep.length - 1].x) < 36) {
      if (n === shown.length - 1) keep[keep.length - 1] = { p: p, x: xx, n: n };
      return;
    }
    keep.push({ p: p, x: xx, n: n });
  });
  var multiYear = points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4);
  keep.forEach(function (tick, n) {
    var anchor = n === 0 ? "start" : n === keep.length - 1 ? "end" : "middle";
    var label = new Date(tick.p.date + "T12:00:00").toLocaleDateString([], { month: "short" }) + (multiYear ? " '" + tick.p.date.slice(2, 4) : "");
    s += '<text x="' + tick.x.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="' + anchor + '" font-size="11" fill="#6E6A62">' + esc(label) + "</text>";
  });
  return s + "</svg>";
}
function renderTrends() {
  $$("#trend-range button").forEach(function (b) { b.classList.toggle("active", +b.dataset.range === trendRange); });
  var pts = trendSeries(), g = current().goals, host = $("#trend-charts");
  trendPlots = pts;
  if (!pts.length) { host.innerHTML = '<p class="empty">Log a few days to see trends.</p>'; $("#trend-tip").hidden = true; return; }
  var specs = [
    ["kcal", "Calories", g.kcal, "#1C1B19", "kcal"],
    ["p", "Protein", g.p, "#1F5C45", "g"],
    ["c", "Carbs", g.c, "#B07D2B", "g"],
    ["f", "Fat", g.f, "#7A5A8C", "g"]
  ];
  host.innerHTML = specs.map(function (s) {
    return '<div class="trend"><h3>' + s[1] + "</h3>" + trendChart(pts, s[0], s[2], s[3], s[4]) + "</div>";
  }).join("");
}
function renderToday() {
  var prof = current(), g = prof.goals, day = selectedDay(), t = dayTotals(day), onToday = day === todayKey();
  var when = new Date(day + "T12:00:00");
  $("#today-date").textContent = when.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  $("#day-next").disabled = onToday;
  $("#day-prev").disabled = day <= earliestKey();
  $("#day-today").hidden = onToday;
  var pick = $("#day-input");
  pick.min = earliestKey();
  pick.max = todayKey();
  pick.value = day;
  $("#today-who").textContent = prof.name;
  $("#kcal-eaten").textContent = n0(t.kcal); $("#kcal-goal").textContent = n0(g.kcal);
  var left = g.kcal - t.kcal, pill = $("#kcal-left");
  pill.textContent = left >= 0 ? n0(left) + " kcal left" : n0(-left) + " kcal over"; pill.classList.toggle("over", left < 0);
  var C = 2 * Math.PI * 50, frac = g.kcal > 0 ? Math.min(1, t.kcal / g.kcal) : 0, fg = $("#ring-fg");
  fg.style.strokeDasharray = C.toFixed(2); fg.style.strokeDashoffset = (C * (1 - frac)).toFixed(2); fg.classList.toggle("over", left < 0);
  var list = prof.foods.filter(function (e) { return dayKey(e.ts) === day; }).sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
  var todayItems = [].concat.apply([], list.map(function (e) { return e.items; }));
  $("#macro-bars").innerHTML = bar("Protein", t.p, g.p, "var(--p)", "g") + bar("Carbs", t.c, g.c, "var(--c)", "g") + bar("Fat", t.f, g.f, "var(--f)", "g");
  $("#macro-bars").hidden = todayNut !== "macros";
  var nut = $("#nutrient-panel");
  nut.hidden = todayNut !== "nutrients";
  nut.innerHTML = nutrientHTML(todayItems, prof);
  $$("#today-mode button").forEach(function (b) { b.classList.toggle("active", b.dataset.nut === todayNut); });
  var foodH = onToday ? "Today's food" : (fmtDay(day) === "Yesterday" ? "Yesterday's food" : fmtShort(day) + " food");
  $("#today-food-h").textContent = foodH;
  $("#today-entries").innerHTML = list.length ? list.map(function (e) { return entryHTML(e, true); }).join("") : '<li class="empty">Nothing logged ' + (onToday ? "yet today." : "on this day.") + "</li>";
  if (!$("#cal").hidden) renderCal();
  renderTrends();
  var ws = sortedWeights();
  if (ws.length) {
    var last = ws[ws.length - 1], prev = ws.length > 1 ? ws[ws.length - 2] : null;
    $("#w-latest").textContent = n1(last.lb) + " lb";
    var to = last.lb - g.weight;
    $("#w-latest-sub").textContent = fmtShort(last.date) + (prev ? " \u00b7 " + (last.lb - prev.lb >= 0 ? "+" : "") + n1(last.lb - prev.lb) + " lb" : "") + " \u00b7 " + (Math.abs(to) < 0.05 ? "at goal" : n1(Math.abs(to)) + " lb " + (to > 0 ? "above" : "below") + " goal");
    $("#w-spark").innerHTML = weightChart(ws.slice(-14), g.weight, true);
  }   else { $("#w-latest").innerHTML = "&mdash;"; $("#w-latest-sub").textContent = "No weigh-ins yet"; $("#w-spark").innerHTML = ""; }
}
$("#day-prev").addEventListener("click", function () { if (!$("#day-prev").disabled) shiftDay(-1); });
$("#day-next").addEventListener("click", function () { if (!$("#day-next").disabled) shiftDay(1); });
$("#day-today").addEventListener("click", function () { closeCal(); setViewDay(todayKey()); });
$("#day-label").addEventListener("click", function () { if ($("#cal").hidden) openCal(); else closeCal(); });
$("#cal-prev").addEventListener("click", function () {
  if ($("#cal-prev").disabled) return;
  var d = new Date(calMonth + "-01T12:00:00");
  d.setMonth(d.getMonth() - 1);
  var next = d.getFullYear() + "-" + pad(d.getMonth() + 1);
  if (next < earliestKey().slice(0, 7)) return;
  calMonth = next;
  renderCal();
});
$("#cal-next").addEventListener("click", function () {
  if ($("#cal-next").disabled) return;
  var d = new Date(calMonth + "-01T12:00:00");
  d.setMonth(d.getMonth() + 1);
  var next = d.getFullYear() + "-" + pad(d.getMonth() + 1);
  if (next > todayKey().slice(0, 7)) return;
  calMonth = next;
  renderCal();
});
$("#cal-grid").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-day]");
  if (!b || b.disabled) return;
  closeCal();
  setViewDay(b.dataset.day);
});
$("#day-input").addEventListener("change", function () {
  if (!this.value) return;
  closeCal();
  setViewDay(this.value);
});
$("#trend-range").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-range]");
  if (!b) return;
  trendRange = +b.dataset.range;
  renderTrends();
});
$("#trend-charts").addEventListener("click", showTrendTip);
$("#trend-charts").addEventListener("pointermove", showTrendTip);
function showTrendTip(ev) {
  var hit = ev.target.closest("[data-tip]");
  var tip = $("#trend-tip");
  var text = hit ? hit.getAttribute("data-tip") : "";
  if (!text) {
    var svg = ev.target.closest("svg[data-key]");
    if (!svg || ev.clientX == null) { tip.hidden = true; return; }
    var rect = svg.getBoundingClientRect();
    if (!rect.width || !trendPlots.length) { tip.hidden = true; return; }
    var vx = (ev.clientX - rect.left) / rect.width * 360, best = null, bestDx = 1e9, key = svg.getAttribute("data-key"), unit = svg.getAttribute("data-unit");
    trendPlots.forEach(function (p) {
      var dx = Math.abs((trendX[p.date] || 0) - vx);
      if (dx < bestDx) { best = p; bestDx = dx; }
    });
    if (!best || bestDx > 28) { tip.hidden = true; return; }
    text = fmtShort(best.date) + ": " + n0(best[key]) + " " + unit;
  }
  tip.hidden = false;
  tip.textContent = text;
}
$("#today-entries").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-act]"); if (!b) return;
  var row = b.closest("[data-id]"); if (!row) return;
  var id = row.dataset.id, prof = current();
  if (b.dataset.act === "del") { if (confirm("Delete this entry?")) { prof.foods = prof.foods.filter(function (e) { return e.id !== id; }); save(); renderAll(); } }
  else openEditor(id);
});
(function () {
  var touch = null, host = $("#view-today");
  host.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1 || e.target.closest("button, a, input, select, textarea, svg, .cal")) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  host.addEventListener("touchend", function (e) {
    if (!touch) return;
    var dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    shiftDay(dx > 0 ? -1 : 1);
  }, { passive: true });
})();

/* ---------------- weight ---------------- */
function sortedWeights() { return current().weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
function weightChart(ws, goal, mini) {
  var W = mini ? 200 : 640, H = mini ? 54 : 300, pl = mini ? 2 : 44, pr = mini ? 2 : 14, pt = mini ? 4 : 14, pb = mini ? 4 : 30;
  if (!ws.length) return mini ? "" : '<div class="empty">Log a weigh-in to see the chart.</div>';
  var vals = ws.map(function (w) { return +w.lb; }).concat([+goal]);
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), padv = Math.max(1, (hi - lo) * 0.12);
  lo = Math.floor(lo - padv); hi = Math.ceil(hi + padv);
  var t0 = new Date(ws[0].date + "T12:00:00").getTime(), t1 = new Date(ws[ws.length - 1].date + "T12:00:00").getTime();
  function x(d) { var t = new Date(d + "T12:00:00").getTime(); return t1 === t0 ? pl + (W - pl - pr) / 2 : pl + (t - t0) / (t1 - t0) * (W - pl - pr); }
  function y(v) { return pt + (hi - v) / (hi - lo) * (H - pt - pb); }
  var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Weight chart">';
  if (!mini) {
    var step = Math.max(1, Math.ceil((hi - lo) / 5));
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E1DDD3"/><text x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="12" fill="#6E6A62">' + v + "</text>";
    var idxs = ws.length <= 1 ? [0] : ws.length === 2 ? [0, 1] : [0, Math.floor((ws.length - 1) / 2), ws.length - 1];
    idxs.forEach(function (i, k) { var anchor = idxs.length > 1 && k === 0 ? "start" : idxs.length > 1 && k === idxs.length - 1 ? "end" : "middle"; s += '<text x="' + x(ws[i].date) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '" font-size="12" fill="#6E6A62">' + esc(fmtShort(ws[i].date)) + "</text>"; });
  }
  s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(goal) + '" y2="' + y(goal) + '" stroke="#1F5C45" stroke-width="' + (mini ? 1.2 : 1.6) + '" stroke-dasharray="' + (mini ? "4 3" : "7 5") + '" opacity=".75"/>';
  if (!mini) s += '<text x="' + (W - pr) + '" y="' + (y(goal) - 6) + '" text-anchor="end" font-size="12" font-weight="600" fill="#1F5C45">Goal ' + n1(goal) + " lb</text>";
  var pts = ws.map(function (w) { return x(w.date).toFixed(1) + "," + y(+w.lb).toFixed(1); });
  if (pts.length > 1) s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#1C1B19" stroke-width="' + (mini ? 2 : 2.4) + '" stroke-linejoin="round" stroke-linecap="round"/>';
  ws.forEach(function (w, i) { if (!mini || i === ws.length - 1) s += '<circle cx="' + x(w.date).toFixed(1) + '" cy="' + y(+w.lb).toFixed(1) + '" r="' + (mini ? 3 : 4) + '" fill="' + (i === ws.length - 1 ? "#1F5C45" : "#1C1B19") + '" stroke="#FBFAF7" stroke-width="1.5"><title>' + esc(w.date + ": " + w.lb + " lb") + "</title></circle>"; });
  return s + "</svg>";
}
function renderWeight() {
  var prof = current(), ws = sortedWeights(), g = prof.goals.weight;
  $("#w-heading").textContent = prof.name + "'s weight";
  $("#w-goal-label").textContent = "Goal " + n1(g) + " lb";
  $("#w-chart").innerHTML = weightChart(ws, g, false);
  if (ws.length) {
    var first = ws[0], last = ws[ws.length - 1], ch = last.lb - first.lb, to = last.lb - g;
    $("#w-stats").innerHTML = "<div><b>" + n1(last.lb) + '</b><span>latest lb</span></div><div><b>' + (ch > 0 ? "+" : "") + n1(ch) + "</b><span>since " + esc(fmtShort(first.date)) + "</span></div><div><b>" + n1(Math.abs(to)) + "</b><span>lb " + (to >= 0 ? "to goal" : "below goal") + "</span></div>";
  } else $("#w-stats").innerHTML = "";
  $("#w-list").innerHTML = ws.length ? ws.slice().reverse().map(function (w) { return '<li><span>' + esc(fmtDay(w.date) === "Today" ? "Today" : fmtShort(w.date) + ", " + w.date.slice(0, 4)) + '</span><span><b>' + n1(w.lb) + ' lb</b> &nbsp; <button data-id="' + w.id + '">Delete</button></span></li>'; }).join("") : '<li class="empty">No entries yet.</li>';
}
$("#weight-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var prof = current();
  if (!canView(prof)) { toast("That profile is locked"); return; }
  var d = $("#w-date").value || todayKey(), v = parseFloat($("#w-value").value);
  if (!(v > 0)) { toast("Enter your weight in lb"); return; }
  var ex = prof.weights.filter(function (w) { return w.date === d; })[0];
  if (ex) { ex.lb = v; toast("Updated " + fmtShort(d) + " to " + n1(v) + " lb"); }
  else { prof.weights.push({ id: uid(), date: d, lb: v }); toast("Logged " + n1(v) + " lb"); }
  save(); $("#w-value").value = ""; renderAll();
});
$("#w-list").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-id]"); if (!b) return;
  var prof = current();
  if (confirm("Delete this weigh-in?")) { prof.weights = prof.weights.filter(function (w) { return w.id !== b.dataset.id; }); save(); renderAll(); }
});

/* ---------------- recipes (shared) ---------------- */
var rEdit = null;
function recipeTotals(rows) { var t = P.totals(rows); t.micros = P.sumMicros(rows); return t; }
function perServing(t, s) {
  s = Math.max(1, +s || 1);
  var o = { kcal: Math.round(t.kcal / s), p: P.round1(t.p / s), c: P.round1(t.c / s), f: P.round1(t.f / s) };
  if (t.micros) o.micros = P.divideMicros(t.micros, s);
  return o;
}
function renderRecipeList() {
  var list = state.recipes.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  $("#recipe-list").innerHTML = list.length ? list.map(function (r) {
    var ps = r.perServing || {};
    return '<div class="card recipe" data-id="' + r.id + '"><div><b>' + esc(r.name) + '</b><div class="macros">' + r.servings + " servings \u00b7 " + r.ingredients.length + ' ingredients</div><div class="macros">Per serving: ' + macroLine(ps) + '</div></div><div class="acts"><button class="btn small" data-act="log">Log 1</button><button class="btn small ghost" data-act="edit">Edit</button><button class="btn small danger" data-act="del">Delete</button></div></div>';
  }).join("") : '<div class="card"><div class="empty">No recipes yet. Add your go-to homemade meals once, then log a serving in one tap \u2014 or just type \u201c1 serving chili\u201d.</div></div>';
}
$("#recipe-list").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-act]"); if (!b) return;
  var id = b.closest(".recipe").dataset.id, r = state.recipes.filter(function (x) { return x.id === id; })[0];
  if (b.dataset.act === "log") logRecipe(id, 1, new Date());
  else if (b.dataset.act === "edit") openRecipe(r);
  else if (confirm("Delete recipe \u201c" + r.name + "\u201d? Logged entries stay.")) { state.recipes = state.recipes.filter(function (x) { return x.id !== id; }); save(); renderAll(); }
});
function openRecipe(r) {
  rEdit = r ? { id: r.id, rows: JSON.parse(JSON.stringify(r.ingredients)) } : { id: null, rows: [] };
  $("#re-title").textContent = r ? "Edit recipe" : "New recipe";
  $("#re-name").value = r ? r.name : ""; $("#re-servings").value = r ? r.servings : 4;
  $("#re-ingredients").value = r ? r.ingredients.map(function (i) { return i.text; }).join("\n") : "";
  $("#recipe-editor").hidden = false; $("#recipe-list-wrap").hidden = true; $("#re-mic-status").textContent = "";
  renderRecipeTable(); $("#re-name").focus();
}
function closeRecipe() { rEdit = null; $("#recipe-editor").hidden = true; $("#recipe-list-wrap").hidden = false; renderAll(); }
$("#recipe-new").addEventListener("click", function () { openRecipe(null); });
$("#re-cancel").addEventListener("click", closeRecipe);
function renderRecipeTable() {
  if (!rEdit || !rEdit.rows.length) { $("#re-table").innerHTML = ""; return; }
  var t = recipeTotals(rEdit.rows), ps = perServing(t, $("#re-servings").value);
  $("#re-table").innerHTML = '<table class="ing"><thead><tr><th>Ingredient</th><th>kcal</th><th>P g</th><th>C g</th><th>F g</th></tr></thead><tbody>' +
    rEdit.rows.map(function (i, idx) {
      return '<tr data-i="' + idx + '"><td class="nm">' + esc(i.text) + '<small class="' + (i.matched ? "" : "miss") + '">' + (i.matched ? "\u2192 " + esc(i.food) + (i.grams ? " (" + i.grams + " g)" : "") + (i.note ? " \u00b7 " + esc(i.note) : "") : "not found \u2014 enter macros") + "</small></td>" +
        ["kcal", "p", "c", "f"].map(function (k) { return '<td><input type="number" step="any" min="0" inputmode="decimal" data-k="' + k + '" value="' + (k === "kcal" ? n0(i[k]) : n1(i[k])) + '"></td>'; }).join("") + "</tr>";
    }).join("") +
    '<tr class="sum"><td>Total</td><td>' + n0(t.kcal) + "</td><td>" + n1(t.p) + "</td><td>" + n1(t.c) + "</td><td>" + n1(t.f) + "</td></tr>" +
    '<tr class="sum" id="re-ps"><td>Per serving</td><td>' + n0(ps.kcal) + "</td><td>" + n1(ps.p) + "</td><td>" + n1(ps.c) + "</td><td>" + n1(ps.f) + "</td></tr></tbody></table>";
}
$("#re-table").addEventListener("change", function (e) {
  var inp = e.target; if (!inp.dataset.k) return;
  var row = rEdit.rows[+inp.closest("tr").dataset.i];
  row[inp.dataset.k] = +inp.value || 0; row.matched = true; if (row.source !== "manual") row.note = "edited"; row.edited = true; row.micros = blankMicros();
  renderRecipeTable();
});
$("#re-servings").addEventListener("input", renderRecipeTable);
function calcRecipe() {
  var lines = $("#re-ingredients").value.split(/\n+/).map(function (l) { return l.replace(/^\s*[-*\u2022]\s*/, "").trim(); }).filter(Boolean);
  var prev = {}; (rEdit.rows || []).forEach(function (r) { if (r.edited) prev[r.text] = r; });
  var items = lines.map(function (l) { return prev[l] || P.resolveSegment(P.normalize(l), INDEX, {}); }).map(function (it, i) { if (!prev[lines[i]]) it.text = lines[i]; return it; });
  var b = $("#re-calc"); b.disabled = true; b.textContent = "Looking up\u2026";
  return enrichOnline(items).then(function (r) {
    rEdit.rows = r.items.map(function (it) { var c = cleanItem(it); if (it.edited) c.edited = true; return c; });
    renderRecipeTable(); if (r.error) { $("#re-mic-status").className = "hint warn"; $("#re-mic-status").textContent = r.error; }
  }).finally(function () { b.disabled = false; b.textContent = "Look up macros"; });
}
$("#re-calc").addEventListener("click", calcRecipe);
setupMic($("#re-mic"), $("#re-mic-status"), function () {}, function (t) {
  var ta = $("#re-ingredients"); ta.value = (ta.value.replace(/\s+$/, "") + (ta.value.trim() ? "\n" : "") + t).trim(); calcRecipe();
});
$("#recipe-editor").addEventListener("submit", function (e) {
  e.preventDefault();
  var name = $("#re-name").value.trim(); if (!name) { toast("Give the recipe a name"); return; }
  var lines = $("#re-ingredients").value.split(/\n+/).map(function (l) { return l.replace(/^\s*[-*\u2022]\s*/, "").trim(); }).filter(Boolean);
  var currentText = rEdit.rows.map(function (r) { return r.text; }).join("\n");
  var go = currentText === lines.join("\n") ? Promise.resolve() : calcRecipe();
  go.then(function () {
    if (!rEdit.rows.length) { toast("Add at least one ingredient"); return; }
    var servings = Math.max(1, +$("#re-servings").value || 1), t = recipeTotals(rEdit.rows);
    var rec = { id: rEdit.id || uid(), name: name, servings: servings, ingredients: rEdit.rows.map(function (r) { return { text: r.text, qty: r.qty, unit: r.unit, food: r.food, source: r.source, matched: r.matched, grams: r.grams, note: r.note, edited: r.edited, kcal: r.kcal, p: r.p, c: r.c, f: r.f, fdcId: r.fdcId, micros: r.micros || null }; }),
      totals: t, perServing: perServing(t, servings), updated: new Date().toISOString() };
    var i = state.recipes.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) state.recipes[i] = rec; else state.recipes.push(rec);
    save(); toast("Saved " + name + " \u2014 " + n0(rec.perServing.kcal) + " kcal per serving"); closeRecipe();
  });
});

/* ---------------- goals, settings, data ---------------- */
function fillGoals() {
  var prof = current(), g = prof.goals;
  $("#goals-heading").textContent = prof.name + "'s daily targets";
  $("#g-kcal").value = g.kcal; $("#g-p").value = g.p; $("#g-c").value = g.c; $("#g-f").value = g.f; $("#g-weight").value = g.weight;
  $("#g-age").value = prof.age == null ? "" : prof.age;
  $("#g-sex").value = prof.sex || "";
  var demo = demoOf(prof);
  $("#g-demo").textContent = demo.assumed ? ("Set " + prof.name + "'s age for accurate targets. Adult male values are used until then.") : ("Nutrient targets use " + (demo.sex === "female" ? "female" : "male") + ", age " + demo.age + ".");
  $("#s-online").checked = !!state.settings.online; $("#s-key").value = state.settings.fdcKey || "";
  checkGoals();
}
function checkGoals() {
  var k = +$("#g-kcal").value || 0, fromM = (+$("#g-p").value || 0) * 4 + (+$("#g-c").value || 0) * 4 + (+$("#g-f").value || 0) * 9;
  $("#g-check").textContent = "Your macros add up to " + n0(fromM) + " kcal (4 per g protein/carbs, 9 per g fat)" + (k ? (Math.abs(fromM - k) <= k * 0.05 ? " \u2014 matches your calorie target." : " vs. a " + n0(k) + " kcal target.") : ".");
}
["#g-kcal", "#g-p", "#g-c", "#g-f"].forEach(function (s) { $(s).addEventListener("input", checkGoals); });
$("#goals-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var prof = current();
  ["kcal", "p", "c", "f", "weight"].forEach(function (k) { var v = parseFloat($("#g-" + k).value); if (v >= 0) prof.goals[k] = v; });
  prof.age = copyAge($("#g-age").value);
  prof.sex = copySex($("#g-sex").value);
  save(); renderAll(); $("#g-saved").textContent = "Saved for " + prof.name + "."; setTimeout(function () { $("#g-saved").textContent = ""; }, 2000);
});
$("#g-reset").addEventListener("click", function () {
  current().goals = copyGoals(null); save(); fillGoals(); renderAll(); toast("Goals reset to defaults");
});
$("#settings-form").addEventListener("submit", function (e) {
  e.preventDefault(); state.settings.online = $("#s-online").checked; state.settings.fdcKey = $("#s-key").value.trim(); save();
  $("#s-saved").textContent = "Saved."; setTimeout(function () { $("#s-saved").textContent = ""; }, 2000);
});
function looksLikeV2(d) { return !!(d && typeof d === "object" && (d.version >= 2 || Array.isArray(d.profiles))); }
function importData(d) {
  if (looksLikeV2(d)) return importV2(d);
  if (!d || typeof d !== "object" || (!Array.isArray(d.foods) && !Array.isArray(d.weights) && !Array.isArray(d.recipes) && !d.goals)) throw new Error("Not a Cadence backup");
  var prof = current();
  if (!canView(prof)) throw new Error("Unlock a profile before importing into it");
  var foods = copyFoods(d.foods), weights = copyWeights(d.weights);
  var goals = d.goals ? copyGoals(d.goals) : copyGoals(prof.goals);
  var recipes = Array.isArray(d.recipes) ? d.recipes.filter(function (r) { return r && r.name; }) : state.recipes;
  var settings = d.settings ? copySettings(d.settings) : state.settings;
  if (!confirm("Import this older backup into " + prof.name + "'s profile? " + prof.name + "'s food log, weights and goals will be replaced (" + foods.length + " food entries, " + weights.length + " weigh-ins). Shared recipes (" + recipes.length + ") and settings will be replaced. Other profiles stay as they are.")) return;
  prof.foods = foods; prof.weights = weights; prof.goals = goals; state.recipes = recipes; state.settings = settings;
  if (window.CadenceSync) stampBase = window.CadenceSync.capture(state);
  save(); fillGoals(); renderAll(); toast("Imported into " + prof.name);
}
function importV2(d) {
  var omitted = Array.isArray(d.omittedProfiles) ? d.omittedProfiles : [];
  var prep = Promise.resolve();
  omitted.forEach(function (o) { if (o && hasKey(o.id)) prep = prep.then(function () { return lockProfile(o.id); }); });
  return prep.then(function () {
    var incoming = sanitizeV2(d);
    var omittedIds = {};
    omitted.forEach(function (o) { if (o && o.id) omittedIds[o.id] = true; });
    if (omitted.length) {
      var incomingIds = {};
      incoming.profiles.forEach(function (p) { incomingIds[p.id] = true; });
      state.profiles.forEach(function (p) { if (omittedIds[p.id] && !incomingIds[p.id]) incoming.profiles.push(p); });
    }
    var names = incoming.profiles.map(function (p) { return p.name; }).join(", ");
    var lockedN = incoming.profiles.filter(function (p) { return p.lock && p.lock.enabled && !p.lock.pending; }).length;
    var note = omitted.length ? " Left out of the file: " + omitted.map(function (o) { return o.name; }).join(", ") + ". Those profiles already on this device are kept." : "";
    if (!confirm("Replace profiles in this browser with this backup (" + names + ", " + incoming.recipes.length + " shared recipes, " + lockedN + " PIN-locked)?" + note)) return;
    sessionKeys = {};
    state = incoming;
    session.viewId = canView(profileById(state.activeProfileId)) ? state.activeProfileId : fallbackProfileId();
    if (window.CadenceSync) stampBase = window.CadenceSync.capture(state);
    save(); fillGoals(); renderAll(); toast("Imported backup");
  });
}
function exportBackup() {
  var skipped = [];
  var include = {};
  state.profiles.forEach(function (p) { if (p.lock && p.lock.damaged) skipped.push(p.name); });
  var locked = state.profiles.filter(function (p) { return p.lock && p.lock.enabled && !p.lock.pending && !p.lock.damaged; });
  var chain = Promise.resolve(true);
  locked.forEach(function (p) {
    chain = chain.then(function (go) {
      if (!go) return false;
      return openGate({ mode: "export-ask", step: "export-ask", profile: p, buf: "", error: "" }).then(function (res) {
        if (res === "skip") { skipped.push(p.name); return true; }
        if (res === true) { include[p.id] = true; return true; }
        return false;
      });
    });
  });
  return chain.then(function (go) {
    if (!go) { toast("Export cancelled"); return; }
    var tasks = state.profiles.map(function (p) {
      if (p.lock && p.lock.damaged) return Promise.resolve(null);
      if (p.lock && p.lock.enabled && !p.lock.pending) {
        if (!include[p.id]) return Promise.resolve(null);
        if (hasKey(p.id)) {
          return window.CadenceLock.seal(sessionKeys[p.id], { foods: p.foods, weights: p.weights, goals: copyGoals(p.goals), age: p.age, sex: p.sex, tombstones: p.tombstones || [], weightTombstones: p.weightTombstones || [] }).then(function (sealed) {
            var lock = JSON.parse(JSON.stringify(p.lock));
            lock.sealed = sealed;
            return { id: p.id, name: p.name, color: p.color, lock: lock };
          });
        }
        return Promise.resolve({ id: p.id, name: p.name, color: p.color, lock: JSON.parse(JSON.stringify(p.lock)) });
      }
      var o = { id: p.id, name: p.name, color: p.color, age: p.age, sex: p.sex, foods: p.foods, weights: p.weights, goals: p.goals, updatedAt: p.updatedAt || null, contentUpdatedAt: p.contentUpdatedAt || null, tombstones: p.tombstones || [], weightTombstones: p.weightTombstones || [] };
      if (p.lock) o.lock = JSON.parse(JSON.stringify(p.lock));
      return Promise.resolve(o);
    });
    return Promise.all(tasks).then(function (rows) {
      var data = {
        exportedAt: new Date().toISOString(), app: "Cadence", version: 5,
        activeProfileId: state.activeProfileId, profiles: rows.filter(Boolean), recipes: state.recipes, webFoods: state.webFoods,
        profileTombstones: state.profileTombstones || [], recipeTombstones: state.recipeTombstones || [], webTombstones: state.webTombstones || [],
        settings: state.settings
      };
      if (skipped.length) data.omittedProfiles = skipped.map(function (name) {
        var p = state.profiles.filter(function (x) { return x.name === name; })[0];
        return { id: p ? p.id : name, name: name };
      });
      window.__cadenceLastExport = data;
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "cadence-backup-" + todayKey() + ".json";
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast(skipped.length ? ("Exported backup. Left out " + skipped.join(", ") + " \u2014 enter the PIN to include a locked profile.") : "Exported backup");
    });
  });
}
$("#d-export").addEventListener("click", function () { exportBackup(); });
$("#d-import").addEventListener("click", function () { $("#d-file").click(); });
$("#d-file").addEventListener("change", function () {
  var file = this.files[0]; if (!file) return;
  var rd = new FileReader();
  rd.onload = function () {
    try { importData(JSON.parse(rd.result)); }
    catch (e) { toast("Import failed: " + e.message); }
  };
  rd.readAsText(file); this.value = "";
});
$("#d-clear").addEventListener("click", function () {
  if (!confirm("Delete ALL Cadence data in this browser? Every profile's food log, weights and goals, plus shared recipes and saved food lookups, will be erased. Joseph, Cindy and Leo are reset. Cindy will need a new PIN. Sync turns off on this device. The cloud copy is not deleted. Export a backup first if you need it.")) return;
  sessionKeys = {};
  forgetSyncLocal();
  state = blankV2();
  session.viewId = "joseph";
  state.activeProfileId = "joseph";
  if (window.CadenceSync) stampBase = window.CadenceSync.capture(state);
  save(); fillGoals(); renderAll(); toast("All data cleared");
});
function renderInfo() {
  var bits = state.profiles.map(function (x) {
    if (x.lock && x.lock.enabled && !x.lock.pending && !hasKey(x.id)) return x.name + ": locked";
    return x.name + ": " + x.foods.length + " entries";
  });
  $("#d-info").textContent = bits.join(" \u00b7 ") + " \u00b7 " + state.recipes.length + " shared recipes \u00b7 " + state.webFoods.length + " saved lookups \u00b7 " + FOODS.length + " foods in the built-in list";
}
function renderLockSettings() {
  var p = current(), el = $("#lock-card-body");
  if (!el || !p) return;
  if (p.lock && p.lock.enabled && !p.lock.pending && !p.lock.damaged) {
    el.innerHTML = "<p class=\"hint\">" + esc(p.name) + "'s food log, goals and weight are encrypted on this device until the PIN is entered. This hides them on a shared phone. It is not protection against someone using developer tools.</p>" +
      '<div class="row wrap"><button type="button" class="btn" id="lock-change">Change PIN</button><button type="button" class="btn ghost" id="lock-off">Turn off lock</button></div>';
  } else {
    el.innerHTML = "<p class=\"hint\">" + esc(p.name) + "'s log is not locked. Anyone using this browser can open it.</p>" +
      '<button type="button" class="btn ghost" id="lock-enable">Lock with PIN</button>';
  }
}
$("#lock-card").addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return;
  var p = current();
  if (b.id === "lock-enable") enableLock(p);
  if (b.id === "lock-change") changePinFlow(p);
  if (b.id === "lock-off") turnOffFlow(p);
});

/* ---------------- profiles ---------------- */
var profileDlg = $("#profile-dialog");
var renamingId = null;
function syncPill() {
  var p = current();
  $("#profile-avatar").textContent = initial(p.name);
  $("#profile-avatar").style.background = p.color;
  $("#profile-name").textContent = p.name;
  $("#profile-pill").classList.toggle("is-locked", !!(p.lock && p.lock.enabled && !p.lock.pending));
  $("#profile-pill").setAttribute("aria-label", "Switch profile, current " + p.name);
}
function renderProfileList() {
  var html = state.profiles.map(function (p) {
    var on = p.id === session.viewId && canView(p);
    var locked = !!(p.lock && p.lock.enabled);
    var avatar = '<span class="avatar" style="background:' + esc(p.color) + '">' + esc(initial(p.name)) + (locked && !p.lock.pending ? '<i class="lockdot"></i>' : "") + "</span>";
    if (renamingId === p.id) {
      return '<div class="profile-row' + (on ? " active" : "") + '" data-id="' + esc(p.id) + '">' + avatar +
        '<form class="rename-form"><input class="rename-input" value="' + esc(p.name) + '" maxlength="24" aria-label="Profile name" required><button class="btn small" type="submit">Save</button></form></div>';
    }
    var acts = '<button type="button" class="mini" data-act="rename">Rename</button><button type="button" class="mini danger" data-act="remove">Remove</button>';
    if (!locked) acts += '<button type="button" class="mini" data-act="lock">Lock with PIN</button>';
    return '<div class="profile-row' + (on ? " active" : "") + '" data-id="' + esc(p.id) + '" role="option" aria-selected="' + (on ? "true" : "false") + '">' + avatar +
      '<button type="button" class="who" data-act="switch">' + esc(p.name) +
      (on ? '<span class="tag">Active</span>' : "") +
      (locked ? '<span class="tag locktag">PIN</span>' : "") + "</button>" +
      '<span class="pacts">' + acts + "</span></div>";
  }).join("");
  $("#profile-list").innerHTML = html;
  var inp = $("#profile-list .rename-input");
  if (inp) { inp.focus(); inp.select(); }
}
function openProfileDialog() {
  renamingId = null;
  renderProfileList();
  if (profileDlg.showModal) { if (!profileDlg.open) profileDlg.showModal(); }
  else profileDlg.setAttribute("open", "");
}
function closeProfileDialog() {
  renamingId = null;
  if (profileDlg.open && profileDlg.close) profileDlg.close();
}
$("#profile-pill").addEventListener("click", openProfileDialog);
$("#profile-close").addEventListener("click", closeProfileDialog);
profileDlg.addEventListener("close", function () { renamingId = null; });
$("#profile-list").addEventListener("click", function (ev) {
  if (ev.target.closest(".rename-form")) return;
  var row = ev.target.closest(".profile-row"); if (!row) return;
  var id = row.getAttribute("data-id");
  var act = ev.target.closest("[data-act]");
  var action = act ? act.getAttribute("data-act") : "switch";
  if (action === "rename") { renamingId = id; renderProfileList(); return; }
  if (action === "remove") { removeProfile(id); return; }
  if (action === "lock") { closeProfileDialog(); enableLock(profileById(id)); return; }
  switchTo(id);
});
$("#profile-list").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var row = ev.target.closest(".profile-row"); if (!row) return;
  renameProfile(row.getAttribute("data-id"), $(".rename-input", row).value);
});
$("#profile-add-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var input = $("#profile-new-name");
  if (addProfile(input.value)) input.value = "";
});
function renameProfile(id, name) {
  name = String(name || "").trim().slice(0, 24);
  if (!name) { toast("Enter a name"); return; }
  if (state.profiles.some(function (p) { return p.id !== id && p.name.toLowerCase() === name.toLowerCase(); })) { toast("There's already a profile named " + name); return; }
  var p = profileById(id); if (!p) return;
  p.name = name; renamingId = null; save(); renderAll(); renderProfileList();
}
function addProfile(name) {
  name = String(name || "").trim().slice(0, 24);
  if (!name) { toast("Enter a name"); return false; }
  if (state.profiles.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) { toast("There's already a profile named " + name); return false; }
  var id = uid();
  state.profiles.push(makeProfile(id, name, PALETTE[state.profiles.length % PALETTE.length]));
  enterProfile(id);
  return true;
}
function removeProfile(id) {
  if (state.profiles.length <= 1) { toast("Keep at least one profile"); return; }
  var p = profileById(id); if (!p) return;
  var finish = function () {
    var sealed = p.lock && p.lock.enabled && !p.lock.pending && !hasKey(p.id);
    var msg;
    if (p.id === "joseph" || sealed || p.foods.length || p.weights.length) {
      msg = sealed
        ? "Remove " + p.name + "? This deletes the encrypted food log, weights and goals saved for " + p.name + "."
        : "Remove " + p.name + "? This deletes " + p.foods.length + " food " + (p.foods.length === 1 ? "entry" : "entries") + " and " + p.weights.length + " weigh-in" + (p.weights.length === 1 ? "" : "s") + ".";
      if (p.id === "joseph") msg += " Joseph's existing data will be removed from this profile.";
    } else msg = "Remove " + p.name + "'s profile?";
    if (!confirm(msg)) return;
    state.profiles = state.profiles.filter(function (x) { return x.id !== id; });
    delete sessionKeys[id];
    if (session.viewId === id || state.activeProfileId === id) {
      var next = fallbackProfileId();
      session.viewId = next;
      state.activeProfileId = next;
    }
    save(); fillGoals(); renderAll();
    if (profileDlg.open) renderProfileList();
    toast("Removed " + p.name);
  };
  if (p.lock && p.lock.damaged) { closeProfileDialog(); openGate({ mode: "damaged", step: "damaged", profile: p, buf: "", error: "" }); return; }
  if (p.lock && p.lock.enabled && !p.lock.pending) {
    closeProfileDialog();
    openGate({ mode: "delete", step: "pin", profile: p, buf: "", error: "", title: "Enter " + p.name + "'s PIN to remove the profile" }).then(function (ok) { if (ok) finish(); });
    return;
  }
  finish();
}
function enterProfile(id) {
  var prev = session.viewId;
  if (dlg && dlg.open) { dlg.close(); editing = null; }
  session.viewId = id;
  state.activeProfileId = id;
  fillGoals();
  renderAll();
  closeProfileDialog();
  var p = profileById(id);
  if (p) toast("Showing " + p.name);
  if (prev && prev !== id && hasKey(prev)) return lockProfile(prev);
  return save();
}
function switchTo(id) {
  var p = profileById(id); if (!p) return;
  if (p.id === session.viewId && canView(p)) { closeProfileDialog(); return; }
  if (!window.CadenceLock || !window.CadenceLock.available()) {
    if (p.lock && p.lock.enabled) { toast("A PIN lock needs https or localhost."); return; }
  }
  if (p.lock && p.lock.enabled && p.lock.pending) {
    closeProfileDialog();
    setupLock(p).then(function (ok) { if (ok) enterProfile(p.id); });
    return;
  }
  if (p.lock && p.lock.enabled && !hasKey(p.id)) {
    closeProfileDialog();
    unlockFlow(p).then(function (ok) { if (ok) enterProfile(p.id); });
    return;
  }
  enterProfile(p.id);
}
function cryptoReady() {
  if (window.CadenceLock && window.CadenceLock.available()) return true;
  toast("A PIN lock needs https or localhost.");
  return false;
}
function setupLock(p) {
  if (!cryptoReady()) return Promise.resolve(false);
  return openGate({ mode: "setup", step: "create", profile: p, buf: "", error: "", title: "Create a 4\u20136 digit PIN for " + p.name, sub: "Enter it twice. Then write down the recovery code." });
}
function enableLock(p) {
  if (!p || !cryptoReady()) return Promise.resolve(false);
  if (p.lock && p.lock.enabled && !p.lock.pending) { toast(p.name + " already has a PIN"); return Promise.resolve(false); }
  var viewing = p.id === session.viewId && canView(p);
  return setupLock(p).then(function (ok) {
    if (!ok) return false;
    if (viewing) { save(); renderLockSettings(); toast(p.name + " is now locked with a PIN"); return true; }
    return lockProfile(p.id).then(function () { toast(p.name + " is now locked with a PIN"); return true; });
  });
}
function unlockFlow(p) {
  if (p.lock && p.lock.damaged) return openGate({ mode: "damaged", step: "damaged", profile: p, buf: "", error: "" });
  return openGate({ mode: "unlock", step: "pin", profile: p, buf: "", error: "", title: "Enter " + p.name + "'s PIN" });
}
function changePinFlow(p) {
  if (!p || !p.lock || p.lock.pending || !hasKey(p.id)) { toast("Open the profile with its PIN first"); return; }
  openGate({ mode: "change", step: "current", profile: p, buf: "", error: "", title: "Enter the current PIN" }).then(function (ok) {
    if (ok) renderLockSettings();
  });
}
function turnOffFlow(p) {
  if (!p || !p.lock || !p.lock.enabled || p.lock.pending) return;
  openGate({ mode: "off", step: "pin", profile: p, buf: "", error: "", title: "Enter " + p.name + "'s PIN to turn off the lock", sub: "The log stays on this device, without a PIN." }).then(function (ok) {
    if (!ok) return;
    delete sessionKeys[p.id];
    p.lock = null;
    save();
    renderLockSettings();
    syncPill();
    toast("PIN lock is off");
  });
}

/* ---------------- PIN gate ---------------- */
var gateDlg = $("#gate-dialog");
var gateState = null;
var gateTick = null;
function cooldownLeft(id) {
  var f = fails[id];
  if (!f || !f.until) return 0;
  var left = f.until - Date.now();
  if (left <= 0) { f.until = 0; f.n = 0; storeFails(); return 0; }
  return left;
}
function storeFails() { try { sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(fails)); } catch (e) {} }
function noteFail(id) {
  var f = fails[id] || { n: 0, until: 0 };
  if (f.until && f.until > Date.now()) return;
  f.n = (f.n || 0) + 1;
  if (f.n >= FAIL_LIMIT) { f.until = Date.now() + COOLDOWN_MS; f.n = 0; }
  fails[id] = f;
  storeFails();
}
function noteSuccess(id) { fails[id] = { n: 0, until: 0 }; storeFails(); }
function dotsHtml(buf) {
  var s = '<div class="dots" id="gate-dots" aria-hidden="true">';
  for (var i = 0; i < 6; i++) s += '<i class="' + (i < buf.length ? "on" : "") + '"></i>';
  return s + "</div>";
}
function padHtml() {
  var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return '<div class="pad" id="gate-pad">' + keys.map(function (k) {
    if (!k) return '<button type="button" class="ghostkey" tabindex="-1" disabled></button>';
    if (k === "del") return '<button type="button" class="fn" data-act="back" aria-label="Delete digit">\u232b</button>';
    return '<button type="button" data-digit="' + k + '">' + k + "</button>";
  }).join("") + "</div>";
}
function renderGate() {
  if (!gateState) return;
  var st = gateState, p = st.profile, left = cooldownLeft(p.id);
  var title = st.title || "", sub = st.sub || "", body = "";
  if (st.step === "export-ask") {
    title = "Include " + p.name + " in this backup?";
    sub = "A PIN is required. Leave " + p.name + " out and this file won't contain that log.";
    body = '<div class="row wrap center"><button type="button" class="btn" id="gate-include">Enter PIN</button><button type="button" class="btn ghost" id="gate-skip">Leave out</button></div><button type="button" class="link block" id="gate-cancel">Cancel export</button>';
  } else if (st.step === "showcode") {
    title = "Write this down";
    sub = "This recovery code is shown once. It resets " + p.name + "'s PIN and keeps the log. Leave now and the PIN is not saved.";
    body = '<div class="gate-code" id="gate-code">' + esc(window.CadenceLock.formatCode(st.pending.recoveryCode)) + '</div><button type="button" class="btn wide" id="gate-ack">I\u2019ve written it down</button>';
  } else if (st.step === "recovery") {
    title = "Recovery code";
    sub = "Enter the 8 character code for " + p.name + ".";
    body = '<input id="gate-recovery" class="gate-input" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Recovery code" placeholder="ABCD-EFGH">' +
      '<button class="btn wide" type="submit" id="gate-next">Continue</button><button type="button" class="link danger block" id="gate-reset">Reset profile</button><button type="button" class="link block" id="gate-cancel">Not now</button>';
  } else if (st.step === "reset") {
    title = "Reset " + p.name;
    sub = "This erases " + p.name + "'s food, weight and goals. Type " + p.name + " to confirm. The profile stays locked until a new PIN is created.";
    body = '<input id="gate-confirm-name" class="gate-input" autocomplete="off" aria-label="Type the profile name to confirm" placeholder="' + esc(p.name) + '">' +
      '<button class="btn wide danger" type="submit" id="gate-next">Erase profile</button><button type="button" class="link block" id="gate-back">Back</button>';
  } else if (st.step === "damaged") {
    title = p.name + "\u2019s lock can\u2019t be opened";
    sub = "Resetting erases whatever was stored for this profile. There is no way to view it without the PIN or recovery code.";
    body = '<button type="button" class="btn wide danger" id="gate-reset">Reset profile</button><button type="button" class="link block" id="gate-cancel">Not now</button>';
  } else {
    if (!title) {
      if (st.step === "create") title = (st.mode === "change" || st.mode === "recover-new") ? "Enter a new 4\u20136 digit PIN" : "Create a 4\u20136 digit PIN for " + p.name;
      else if (st.step === "confirm") title = "Enter the same PIN again";
      else if (st.step === "current") title = "Enter the current PIN";
      else title = "Enter " + p.name + "'s PIN";
    }
    if (left > 0) sub = "Too many tries. Wait " + Math.ceil(left / 1000) + "s.";
    else if (!sub && st.step === "create" && st.mode === "setup") sub = "This only hides " + p.name + "'s log on this device.";
    else if (!sub && (st.mode === "unlock" || st.mode === "delete" || st.mode === "off" || st.mode === "export")) sub = "Nothing of " + p.name + "'s is shown until the PIN is right.";
    var label = st.busy ? "Checking\u2026" : (st.mode === "unlock" && st.step === "pin" ? "Unlock" : "Next");
    body = dotsHtml(st.buf) + padHtml() +
      '<button class="btn wide" type="submit" id="gate-next"' + (st.buf.length < 4 || left > 0 || st.busy ? " disabled" : "") + ">" + label + "</button>";
    if (st.mode === "unlock" && st.step === "pin") body += '<button type="button" class="link block" id="gate-forgot">Forgot PIN?</button>';
    if (st.step !== "showcode") body += '<button type="button" class="link block" id="gate-cancel">Not now</button>';
  }
  $("#gate-root").innerHTML = '<form id="gate-form" autocomplete="off"><div class="gate-ava" style="background:' + esc(p.color) + '">' + esc(initial(p.name)) + "</div>" +
    '<h2 id="gate-title">' + esc(title) + "</h2>" + (sub ? '<p class="sub" id="gate-sub">' + esc(sub) + "</p>" : "") +
    '<div id="gate-error" class="hint warn" role="status">' + esc(st.error || "") + "</div>" + body + "</form>";
  var rec = $("#gate-recovery"), name = $("#gate-confirm-name");
  if (rec) rec.focus(); else if (name) name.focus();
  if (gateTick) { clearInterval(gateTick); gateTick = null; }
  if (left > 0) {
    gateTick = setInterval(function () {
      if (!gateState) { clearInterval(gateTick); return; }
      var remain = cooldownLeft(gateState.profile.id);
      var node = $("#gate-sub");
      if (remain <= 0) { clearInterval(gateTick); gateTick = null; gateState.error = ""; gateState.sub = ""; renderGate(); return; }
      if (node) node.textContent = "Too many tries. Wait " + Math.ceil(remain / 1000) + "s.";
    }, 250);
  }
}
function openGate(partial) {
  if (gateState) closeGate(false);
  return new Promise(function (resolve) {
    gateState = partial;
    gateState.resolve = resolve;
    gateState.buf = partial.buf || "";
    gateState.error = partial.error || "";
    gateState.busy = false;
    renderGate();
    if (gateDlg.showModal) { if (!gateDlg.open) gateDlg.showModal(); }
    else gateDlg.setAttribute("open", "");
  });
}
function closeGate(result) {
  if (gateTick) { clearInterval(gateTick); gateTick = null; }
  var st = gateState;
  gateState = null;
  if (gateDlg.open && gateDlg.close) gateDlg.close();
  if ($("#gate-root")) $("#gate-root").innerHTML = "";
  if (st && st.resolve) st.resolve(result);
}
function pushDigit(d) {
  if (!gateState || gateState.busy) return;
  if (gateState.step === "recovery" || gateState.step === "reset" || gateState.step === "showcode" || gateState.step === "export-ask" || gateState.step === "damaged") return;
  if (cooldownLeft(gateState.profile.id) > 0) return;
  if (gateState.buf.length >= 6) return;
  gateState.buf += d;
  gateState.error = "";
  var dots = $("#gate-dots");
  if (!dots) { renderGate(); return; }
  var nodes = dots.querySelectorAll("i");
  for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle("on", i < gateState.buf.length);
  var err = $("#gate-error"); if (err) err.textContent = "";
  var next = $("#gate-next"); if (next) next.disabled = gateState.buf.length < 4;
}
function popDigit() {
  if (!gateState || gateState.busy || !gateState.buf) return;
  gateState.buf = gateState.buf.slice(0, -1);
  var dots = $("#gate-dots"); if (!dots) return;
  var nodes = dots.querySelectorAll("i");
  for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle("on", i < gateState.buf.length);
  var next = $("#gate-next"); if (next) next.disabled = gateState.buf.length < 4;
}
function submitGate() {
  if (!gateState || gateState.busy) return;
  var st = gateState, p = st.profile;
  if (st.step === "export-ask" || st.step === "showcode" || st.step === "damaged") return;
  if (st.step === "reset") { doReset(p); return; }
  if (st.step === "recovery") { doRecovery(p); return; }
  if (st.buf.length < 4 || st.buf.length > 6) { st.error = "Use a 4 to 6 digit PIN"; renderGate(); return; }
  if (cooldownLeft(p.id) > 0) { st.error = "Too many tries. Wait " + Math.ceil(cooldownLeft(p.id) / 1000) + "s."; renderGate(); return; }
  if (st.step === "create") { st.firstPin = st.buf; st.buf = ""; st.step = "confirm"; st.error = ""; st.title = ""; st.sub = ""; renderGate(); return; }
  if (st.step === "confirm") {
    if (st.buf !== st.firstPin) { st.error = "Those PINs didn\u2019t match. Try again."; st.buf = ""; st.firstPin = ""; st.step = "create"; st.title = ""; renderGate(); return; }
    if (st.mode === "setup" || st.mode === "reset-setup") finishSetup(p, st.buf);
    else finishNewPin(p, st.buf);
    return;
  }
  if (st.step === "pin" || st.step === "current") checkPin(p, st.buf);
}
function finishSetup(p, pin) {
  gateState.busy = true; renderGate();
  window.CadenceLock.setup(pin).then(function (res) {
    if (!gateState) return;
    gateState.pending = res;
    gateState.step = "showcode";
    gateState.busy = false;
    gateState.error = "";
    gateState.title = "";
    gateState.sub = "";
    renderGate();
  }).catch(function (e) {
    if (!gateState) return;
    gateState.busy = false;
    gateState.error = e.message || "Couldn\u2019t create a PIN";
    renderGate();
  });
}
function acknowledgeSetup() {
  if (!gateState || !gateState.pending) return;
  var p = gateState.profile, res = gateState.pending;
  p.lock = res.lock;
  sessionKeys[p.id] = res.dek;
  closeGate(true);
}
function checkPin(p, pin) {
  var st = gateState;
  st.busy = true; renderGate();
  window.CadenceLock.unlockPin(p.lock, pin).then(function (dek) {
    noteSuccess(p.id);
    if (!gateState) return;
    if (st.mode === "unlock") {
      var opened = p.lock.sealed ? window.CadenceLock.open(dek, p.lock.sealed) : Promise.resolve({ foods: [], weights: [], goals: null });
      return opened.then(function (data) { applyOpened(p, dek, data); closeGate(true); }, function () {
        if (!gateState) return;
        st.busy = false; st.error = "Couldn\u2019t open this profile"; renderGate();
      });
    }
    if (st.mode === "change" && st.step === "current") {
      st.dek = dek; st.step = "create"; st.buf = ""; st.firstPin = ""; st.busy = false; st.error = ""; st.title = ""; st.sub = ""; renderGate();
      return;
    }
    closeGate(true);
  }, function (e) {
    noteFail(p.id);
    if (!gateState) return;
    st.busy = false; st.buf = "";
    st.error = cooldownLeft(p.id) > 0 ? ("Too many tries. Wait " + Math.ceil(cooldownLeft(p.id) / 1000) + "s.") : (e.message || "Wrong PIN");
    renderGate();
  });
}
function finishNewPin(p, pin) {
  var st = gateState;
  if (!st.dek) { st.error = "Enter the current PIN first"; renderGate(); return; }
  st.busy = true; renderGate();
  window.CadenceLock.changePin(p.lock, st.dek, pin).then(function (lock) {
    p.lock = lock;
    if (st.openedData) applyOpened(p, st.dek, st.openedData);
    else sessionKeys[p.id] = st.dek;
    save();
    closeGate(true);
    toast("PIN changed");
  }).catch(function (e) {
    if (!gateState) return;
    st.busy = false; st.error = e.message || "Couldn\u2019t change the PIN"; renderGate();
  });
}
function doRecovery(p) {
  var code = $("#gate-recovery") ? $("#gate-recovery").value : "";
  if (cooldownLeft(p.id) > 0) { gateState.error = "Too many tries. Wait " + Math.ceil(cooldownLeft(p.id) / 1000) + "s."; renderGate(); return; }
  gateState.busy = true; renderGate();
  window.CadenceLock.unlockRecovery(p.lock, code).then(function (dek) {
    noteSuccess(p.id);
    var opened = p.lock.sealed ? window.CadenceLock.open(dek, p.lock.sealed) : Promise.resolve({ foods: [], weights: [], goals: null });
    return opened.then(function (data) {
      if (!gateState) return;
      gateState.dek = dek;
      gateState.openedData = data;
      gateState.mode = "recover-new";
      gateState.step = "create";
      gateState.buf = "";
      gateState.firstPin = "";
      gateState.busy = false;
      gateState.error = "";
      gateState.title = "";
      gateState.sub = "Choose a new PIN for " + p.name + ". The log is kept.";
      renderGate();
    });
  }).catch(function (e) {
    noteFail(p.id);
    if (!gateState) return;
    gateState.busy = false;
    gateState.error = cooldownLeft(p.id) > 0 ? ("Too many tries. Wait " + Math.ceil(cooldownLeft(p.id) / 1000) + "s.") : (e.message || "Wrong recovery code");
    renderGate();
  });
}
function doReset(p) {
  var typed = $("#gate-confirm-name") ? $("#gate-confirm-name").value : "";
  if (String(typed || "").trim().toLowerCase() !== String(p.name || "").trim().toLowerCase()) {
    gateState.error = "Type " + p.name + " to confirm.";
    renderGate();
    return;
  }
  delete sessionKeys[p.id];
  p.foods = [];
  p.weights = [];
  p.goals = copyGoals(null);
  p.lock = { enabled: true, pending: true };
  save();
  gateState.mode = "reset-setup";
  gateState.step = "create";
  gateState.buf = "";
  gateState.firstPin = "";
  gateState.pending = null;
  gateState.dek = null;
  gateState.openedData = null;
  gateState.error = "";
  gateState.title = "Create a 4\u20136 digit PIN for " + p.name;
  gateState.sub = "The old log was erased.";
  renderGate();
}
gateDlg.addEventListener("click", function (ev) {
  if (!gateState) return;
  var t = ev.target.closest("button"); if (!t) return;
  if (t.getAttribute("data-digit")) { pushDigit(t.getAttribute("data-digit")); return; }
  if (t.getAttribute("data-act") === "back") { popDigit(); return; }
  if (t.id === "gate-cancel") { closeGate(false); return; }
  if (t.id === "gate-skip") { closeGate("skip"); return; }
  if (t.id === "gate-include") { gateState.step = "pin"; gateState.mode = "export"; gateState.buf = ""; gateState.error = ""; gateState.title = "Enter " + gateState.profile.name + "'s PIN"; gateState.sub = ""; renderGate(); return; }
  if (t.id === "gate-forgot") { gateState.step = "recovery"; gateState.error = ""; gateState.title = ""; gateState.sub = ""; renderGate(); return; }
  if (t.id === "gate-reset") { gateState.step = "reset"; gateState.error = ""; gateState.title = ""; gateState.sub = ""; renderGate(); return; }
  if (t.id === "gate-back") { gateState.step = "recovery"; gateState.error = ""; renderGate(); return; }
  if (t.id === "gate-ack") acknowledgeSetup();
});
gateDlg.addEventListener("submit", function (ev) { ev.preventDefault(); submitGate(); });
gateDlg.addEventListener("cancel", function (e) {
  e.preventDefault();
  if (!gateState || gateState.step === "showcode") return;
  closeGate(false);
});
gateDlg.addEventListener("keydown", function (e) {
  if (!gateState) return;
  if (gateState.step === "recovery" || gateState.step === "reset" || gateState.step === "showcode" || gateState.step === "export-ask" || gateState.step === "damaged") return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); pushDigit(e.key); }
  else if (e.key === "Backspace") { e.preventDefault(); popDigit(); }
});

/* ---------------- sync ---------------- */
var DEVICE_KEY = "cadence.sync.device";
var syncQueue = window.CadenceSync.createQueue();
var syncDek = null;
var syncTimer = null;
var syncing = false;
var fbLibs = null;
var fbApp = null;
var fbAuth = null;
function readDevice() {
  try {
    var d = JSON.parse(localStorage.getItem(DEVICE_KEY) || "");
    return d && typeof d === "object" ? d : {};
  } catch (e) { return {}; }
}
function writeDevice(d) { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); }
function syncDevice() {
  var d = readDevice();
  if (typeof d.enabled !== "boolean") d.enabled = false;
  return d;
}
function forgetSyncLocal() {
  syncDek = null;
  if (syncTimer) clearTimeout(syncTimer);
  syncQueue.clear();
  try { localStorage.removeItem(DEVICE_KEY); } catch (e) {}
  if (fbAuth && fbLibs) { try { fbLibs.auth.signOut(fbAuth); } catch (e2) {} }
}
function noteSyncChange() {
  var d = syncDevice();
  if (!d.enabled) return;
  syncQueue.note();
  d.pending = syncQueue.count();
  writeDevice(d);
  scheduleSync();
  renderSync();
}
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(function () { runSync(); }, 1200);
}
function householdModel() {
  return {
    profiles: state.profiles.map(function (p) {
      var opaque = !!(p.lock && p.lock.enabled && !p.lock.pending && !hasKey(p.id));
      return {
        id: p.id, name: p.name, color: p.color, age: p.age, sex: p.sex, goals: copyGoals(p.goals),
        lock: p.lock ? JSON.parse(JSON.stringify(p.lock)) : null,
        updatedAt: p.updatedAt || null, contentUpdatedAt: p.contentUpdatedAt || null,
        foods: opaque ? [] : JSON.parse(JSON.stringify(p.foods || [])),
        weights: opaque ? [] : JSON.parse(JSON.stringify(p.weights || [])),
        tombstones: opaque ? [] : JSON.parse(JSON.stringify(p.tombstones || [])),
        weightTombstones: opaque ? [] : JSON.parse(JSON.stringify(p.weightTombstones || [])),
        opaque: opaque
      };
    }),
    profileTombstones: JSON.parse(JSON.stringify(state.profileTombstones || [])),
    recipes: JSON.parse(JSON.stringify(state.recipes || [])),
    recipeTombstones: JSON.parse(JSON.stringify(state.recipeTombstones || [])),
    webFoods: JSON.parse(JSON.stringify(state.webFoods || [])),
    webTombstones: JSON.parse(JSON.stringify(state.webTombstones || []))
  };
}
function prepareRemote(remote) {
  return Promise.all((remote.profiles || []).map(function (p) {
    if (p.lock && p.lock.sealed && hasKey(p.id)) {
      return window.CadenceLock.open(sessionKeys[p.id], p.lock.sealed).then(function (data) {
        p.foods = copyFoods(data && data.foods);
        p.weights = copyWeights(data && data.weights);
        p.goals = copyGoals(data && data.goals);
        if (data && Object.prototype.hasOwnProperty.call(data, "age")) p.age = copyAge(data.age);
        if (data && Object.prototype.hasOwnProperty.call(data, "sex")) p.sex = copySex(data.sex);
        p.tombstones = copyTombstones(data && data.tombstones);
        p.weightTombstones = copyTombstones(data && data.weightTombstones);
        p.opaque = false;
        return p;
      });
    }
    if (p.lock && p.lock.enabled && !p.lock.pending) p.opaque = true;
    return p;
  })).then(function () { return remote; });
}
function modelForPush(model) {
  return Promise.all((model.profiles || []).map(function (p) {
    if (p.lock && p.lock.enabled && !p.lock.pending && hasKey(p.id)) {
      return window.CadenceLock.seal(sessionKeys[p.id], {
        foods: p.foods, weights: p.weights, goals: p.goals, age: p.age, sex: p.sex,
        tombstones: p.tombstones || [], weightTombstones: p.weightTombstones || []
      }).then(function (sealed) {
        var lock = JSON.parse(JSON.stringify(p.lock));
        lock.sealed = sealed;
        return { id: p.id, name: p.name, color: p.color, lock: lock, updatedAt: p.updatedAt, contentUpdatedAt: p.contentUpdatedAt, opaque: true };
      });
    }
    if (p.opaque) {
      return { id: p.id, name: p.name, color: p.color, lock: p.lock, updatedAt: p.updatedAt, contentUpdatedAt: p.contentUpdatedAt, age: p.age, sex: p.sex, goals: p.goals, opaque: true };
    }
    var copy = JSON.parse(JSON.stringify(p));
    delete copy.opaque;
    return copy;
  })).then(function (profiles) {
    return {
      profiles: profiles,
      profileTombstones: model.profileTombstones || [],
      recipes: model.recipes || [],
      recipeTombstones: model.recipeTombstones || [],
      webFoods: model.webFoods || [],
      webTombstones: model.webTombstones || []
    };
  });
}
function applyMerged(merged) {
  applyingSync = true;
  var seen = {};
  (merged.profiles || []).forEach(function (p) {
    seen[p.id] = 1;
    var cur = profileById(p.id);
    if (!cur) {
      state.profiles.push(profileFromStored(p, state.profiles.length));
      cur = profileById(p.id);
    }
    cur.name = p.name || cur.name;
    cur.color = p.color || cur.color;
    cur.updatedAt = p.updatedAt || cur.updatedAt;
    cur.contentUpdatedAt = p.contentUpdatedAt || cur.contentUpdatedAt;
    if (p.lock) cur.lock = p.lock;
    if (p.opaque && !hasKey(cur.id)) return;
    cur.age = p.age;
    cur.sex = p.sex;
    cur.goals = copyGoals(p.goals);
    cur.foods = copyFoods(p.foods);
    cur.weights = copyWeights(p.weights);
    cur.tombstones = copyTombstones(p.tombstones);
    cur.weightTombstones = copyTombstones(p.weightTombstones);
  });
  state.profiles = state.profiles.filter(function (p) { return seen[p.id]; });
  state.profileTombstones = copyTombstones(merged.profileTombstones);
  state.recipes = merged.recipes || [];
  state.recipeTombstones = copyTombstones(merged.recipeTombstones);
  state.webFoods = copyWebFoods(merged.webFoods);
  state.webTombstones = copyTombstones(merged.webTombstones, "key");
  if (!profileById(session.viewId) || !canView(profileById(session.viewId))) session.viewId = fallbackProfileId();
  return save().then(function () { applyingSync = false; fillGoals(); renderAll(); }, function (e) { applyingSync = false; throw e; });
}
function ensureFirebase() {
  var cfg = window.CADENCE_SYNC_CONFIG || {};
  if (!window.CadenceSync.configReady(cfg)) return Promise.reject(new Error("config"));
  return window.CadenceSync.loadFirebase().then(function (libs) {
    fbLibs = libs;
    if (!fbApp) fbApp = libs.app.initializeApp(cfg);
    if (!fbAuth) fbAuth = libs.auth.getAuth(fbApp);
    return libs;
  });
}
function syncBackend() { return window.CadenceSync.createFirebaseBackend(fbLibs, fbApp); }
function runSync() {
  var d = syncDevice();
  if (syncing || !d.enabled || !syncDek || !fbAuth || !fbAuth.currentUser) { renderSync(); return Promise.resolve(); }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    d.lastError = "Offline. Changes stay on this device until it reconnects.";
    d.pending = syncQueue.count();
    writeDevice(d);
    renderSync();
    return Promise.resolve();
  }
  syncing = true;
  renderSync();
  var uid = fbAuth.currentUser.uid;
  var backend = syncBackend();
  return window.CadenceSync.pullHousehold(backend, syncDek, uid).then(prepareRemote).then(function (remote) {
    var merged = window.CadenceSync.mergeHousehold(householdModel(), remote);
    return modelForPush(merged).then(function (stored) {
      return window.CadenceSync.pushHousehold(backend, syncDek, uid, stored).then(function () { return applyMerged(merged); });
    });
  }).then(function () {
    syncQueue.clear();
    var next = syncDevice();
    next.lastSynced = new Date().toISOString();
    next.lastError = "";
    next.pending = 0;
    next.uid = uid;
    writeDevice(next);
  }, function (e) {
    var next = syncDevice();
    next.lastError = (e && e.message) || "Sync failed";
    next.pending = syncQueue.count();
    writeDevice(next);
  }).then(function () { syncing = false; renderSync(); });
}
function rememberDek(dek, record) {
  return window.CadenceSync.exportDek(dek).then(function (raw) {
    syncDek = dek;
    var d = syncDevice();
    d.enabled = true;
    d.dekRaw = raw;
    d.record = record;
    d.pending = syncQueue.count();
    if (fbAuth && fbAuth.currentUser) { d.uid = fbAuth.currentUser.uid; d.email = fbAuth.currentUser.email || ""; }
    writeDevice(d);
  });
}
function afterGoogle(user) {
  var d = syncDevice();
  d.enabled = true;
  d.uid = user.uid;
  d.email = user.email || "";
  writeDevice(d);
  return syncBackend().getDoc(window.CadenceSync.paths(user.uid).key).then(function (keyDoc) {
    var next = syncDevice();
    next.needPass = keyDoc && keyDoc.wrap ? "unlock" : "create";
    if (keyDoc && keyDoc.wrap) next.record = keyDoc;
    writeDevice(next);
    renderSync();
  });
}
function startGoogle() {
  var d = syncDevice();
  d.lastError = "";
  writeDevice(d);
  renderSync();
  return ensureFirebase().then(function (libs) {
    var provider = new libs.auth.GoogleAuthProvider();
    return libs.auth.signInWithPopup(fbAuth, provider);
  }).then(function (cred) { return afterGoogle(cred.user); }).catch(function (e) {
    if (e && e.message === "config") return;
    var next = syncDevice();
    next.lastError = (e && e.message) || "Google sign-in failed";
    writeDevice(next);
    renderSync();
  });
}
function submitPassphrase(pass, confirmPass) {
  var d = syncDevice();
  var creating = d.needPass === "create";
  if (creating && pass !== confirmPass) { d.lastError = "The two passphrases don't match."; writeDevice(d); renderSync(); return; }
  d.lastError = "";
  d.busy = true;
  writeDevice(d);
  renderSync();
  var done = creating
    ? window.CadenceSync.setupPassphrase(pass).then(function (made) {
      return rememberDek(made.dek, made.record).then(function () {
        return syncBackend().setDoc(window.CadenceSync.paths(fbAuth.currentUser.uid).key, made.record);
      });
    })
    : window.CadenceSync.unlockPassphrase(d.record, pass).then(function (dek) { return rememberDek(dek, d.record); });
  done.then(function () {
    var next = syncDevice();
    next.needPass = "";
    next.busy = false;
    next.lastError = "";
    writeDevice(next);
    return runSync();
  }).catch(function (e) {
    var next = syncDevice();
    next.busy = false;
    next.lastError = (e && e.message) || "Could not unlock sync";
    writeDevice(next);
    renderSync();
  });
}
function turnOffSync() {
  if (!confirm("Turn off sync on this device and delete the encrypted cloud copy? The log on this device stays. Other devices will not receive new changes, and this cloud copy will be removed.")) return;
  var d = syncDevice();
  var uid = (fbAuth && fbAuth.currentUser && fbAuth.currentUser.uid) || d.uid;
  var job = (uid && fbLibs && fbApp) ? window.CadenceSync.deleteCloud(syncBackend(), uid) : Promise.resolve();
  job.then(function () { forgetSyncLocal(); renderSync(); toast("Sync is off. The cloud copy was deleted."); }, function (e) {
    toast("Could not delete the cloud copy: " + ((e && e.message) || "try again online"));
  });
}
function fmtSynced(iso) {
  if (!iso) return "Not yet";
  var t = new Date(iso);
  if (isNaN(t.getTime())) return "Not yet";
  return t.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function renderSync() {
  var el = $("#sync-body");
  if (!el) return;
  var d = syncDevice();
  var ready = window.CadenceSync.configReady(window.CADENCE_SYNC_CONFIG || {});
  var html = "";
  if (!d.enabled) {
    html = '<p class="hint">Sync is off. This browser keeps its own copy, and nothing is sent until you turn sync on.</p>';
    if (!ready) html += '<p class="hint">The Firebase project is not connected yet. Paste the config into <b>js/sync-config.js</b>. The README has the click-by-click steps.</p>';
    html += '<button type="button" class="btn" id="sync-on">Turn on sync</button>';
  } else if (!ready) {
    html = '<p class="hint warn">Sync was turned on, but js/sync-config.js still has placeholders. Paste the Firebase config, then reload.</p>';
  } else if (!fbAuth || !fbAuth.currentUser) {
    html = '<p class="hint">Sign in with Google to reach this household\'s encrypted copy. The Google account is not the sync passphrase.</p>' +
      (d.email ? '<p class="hint">Last signed in as ' + esc(d.email) + '.</p>' : "") +
      '<div class="row wrap"><button type="button" class="btn" id="sync-google">Sign in with Google</button><button type="button" class="btn ghost" id="sync-off">Turn off sync and delete cloud copy</button></div>';
  } else if (d.needPass === "create" || d.needPass === "unlock") {
    html = '<p class="hint warn">If you lose this passphrase, the cloud copy cannot be decrypted. The log on this device is not affected. The passphrase is never uploaded.</p>' +
      '<p class="hint">Cindy\'s profile stays sealed with her PIN. Signing into the household account does not open her log.</p>' +
      '<label>Household sync passphrase<input id="sync-pass" type="password" autocomplete="new-password" minlength="8"></label>' +
      (d.needPass === "create" ? '<label>Confirm passphrase<input id="sync-pass2" type="password" autocomplete="new-password" minlength="8"></label>' : "") +
      '<div class="row wrap"><button type="button" class="btn" id="sync-pass-save">' + (d.busy ? "Checking…" : (d.needPass === "create" ? "Set passphrase" : "Unlock sync")) + '</button></div>';
  } else {
    html = '<div class="sync-status"><span>Signed in as <b>' + esc((fbAuth.currentUser && fbAuth.currentUser.email) || d.email || "Google") + '</b></span>' +
      '<span>Last synced <b>' + esc(fmtSynced(d.lastSynced)) + '</b></span>' +
      '<span>Pending <b>' + syncQueue.count() + '</b></span></div>' +
      (syncing ? '<p class="hint">Syncing…</p>' : "") +
      '<div class="row wrap"><button type="button" class="btn" id="sync-now">Sync now</button><button type="button" class="btn ghost" id="sync-signout">Sign out</button><button type="button" class="btn danger" id="sync-off">Turn off sync and delete cloud copy</button></div>';
  }
  if (d.lastError) html += '<p class="hint warn">' + esc(d.lastError) + '</p>';
  el.innerHTML = html;
}
function bootSync() {
  var d = syncDevice();
  syncQueue.set(d.pending || 0);
  stampBase = window.CadenceSync.capture(state);
  renderSync();
  window.addEventListener("online", function () { if (syncDevice().enabled && syncDek) runSync(); });
  if (!d.enabled || !d.dekRaw || !window.CadenceSync.configReady(window.CADENCE_SYNC_CONFIG || {})) return;
  window.CadenceSync.importDek(d.dekRaw).then(function (dek) {
    syncDek = dek;
    return ensureFirebase();
  }).then(function (libs) {
    libs.auth.onAuthStateChanged(fbAuth, function (user) {
      if (user && syncDek && syncDevice().enabled) runSync();
      else renderSync();
    });
  }).catch(function (e) {
    var next = syncDevice();
    next.lastError = (e && e.message) || "Could not start sync";
    writeDevice(next);
    renderSync();
  });
}
$("#sync-card").addEventListener("click", function (ev) {
  var b = ev.target.closest("button");
  if (!b) return;
  if (b.id === "sync-on" || b.id === "sync-google") {
    if (!window.CadenceSync.configReady(window.CADENCE_SYNC_CONFIG || {})) { renderSync(); return; }
    startGoogle();
  } else if (b.id === "sync-pass-save") {
    submitPassphrase($("#sync-pass").value, $("#sync-pass2") ? $("#sync-pass2").value : "");
  } else if (b.id === "sync-now") runSync();
  else if (b.id === "sync-signout") {
    if (fbAuth && fbLibs) fbLibs.auth.signOut(fbAuth).then(function () { renderSync(); });
  } else if (b.id === "sync-off") turnOffSync();
});

/* ---------------- boot ---------------- */
function renderAll() {
  if (!canView(profileById(session.viewId))) session.viewId = fallbackProfileId();
  syncPill();
  renderToday();
  renderFood();
  renderWeight();
  renderRecipeList();
  renderLockSettings();
  renderInfo();
  renderSync();
}
var idleTimer = null, hiddenAt = 0;
function lockFromIdle() {
  var ids = Object.keys(sessionKeys);
  if (gateState && gateState.step === "showcode") { armIdle(); return; }
  if (!ids.length) { armIdle(); return; }
  if (gateState) closeGate(false);
  var viewing = ids.indexOf(session.viewId) >= 0;
  var chain = Promise.resolve();
  ids.forEach(function (id) { chain = chain.then(function () { return lockProfile(id); }); });
  chain.then(function () {
    if (viewing || !canView(profileById(session.viewId))) {
      session.viewId = fallbackProfileId();
      fillGoals();
      renderAll();
      toast("Locked for privacy");
    }
    armIdle();
  });
}
function armIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(lockFromIdle, IDLE_MS);
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); if (idleTimer) clearTimeout(idleTimer); }
  else {
    if (hiddenAt && Date.now() - hiddenAt >= IDLE_MS) lockFromIdle();
    else armIdle();
    hiddenAt = 0;
  }
});
["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
  document.addEventListener(ev, armIdle, { passive: true, capture: true });
});
armIdle();
$("#w-date").value = todayKey();
resetWhen();
bootSync();
fillGoals();
showTab((location.hash || "#today").slice(1));
window.addEventListener("hashchange", function () { showTab(location.hash.slice(1)); });
window.addEventListener("storage", function (e) {
  if (e.key !== KEY && e.key !== null) return;
  sessionKeys = {};
  state = load();
  if (window.CadenceSync) stampBase = window.CadenceSync.capture(state);
  if (!canView(profileById(session.viewId))) session.viewId = fallbackProfileId();
  fillGoals();
  renderAll();
});
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
window.Cadence = {
  get state() { return state; },
  get viewId() { return session.viewId; },
  logFood: logFood,
  logRecipe: logRecipe,
  whenSaved: function () { return saveChain; },
  reload: function () {
    sessionKeys = {};
    state = load();
    session.viewId = state.activeProfileId;
    if (!canView(profileById(session.viewId))) session.viewId = fallbackProfileId();
    fillGoals();
    renderAll();
  }
};
})();
