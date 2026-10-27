/* Cadence v1 app logic. Plain JS, no dependencies. */
(function () {
"use strict";
var P = window.CadenceParser, FOODS = window.CADENCE_FOODS, INDEX = P.buildIndex(FOODS);
var KEY = "cadence.v1";
var DEFAULT_GOALS = { kcal: 2200, p: 180, c: 220, f: 70, weight: 180 };
var DEFAULT_SETTINGS = { fdcKey: "", online: true };
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* ---------------- storage ---------------- */
function blank() { return { version: 1, foods: [], weights: [], recipes: [], goals: Object.assign({}, DEFAULT_GOALS), settings: Object.assign({}, DEFAULT_SETTINGS) }; }
function sanitize(d) {
  var b = blank();
  if (!d || typeof d !== "object") return b;
  b.foods = Array.isArray(d.foods) ? d.foods.filter(function (e) { return e && e.ts && Array.isArray(e.items); }) : [];
  b.weights = Array.isArray(d.weights) ? d.weights.filter(function (w) { return w && w.date && +w.lb > 0; }) : [];
  b.recipes = Array.isArray(d.recipes) ? d.recipes.filter(function (r) { return r && r.name; }) : [];
  b.goals = Object.assign({}, DEFAULT_GOALS, d.goals || {});
  b.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
  return b;
}
function load() { try { return sanitize(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { return blank(); } }
var state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast("Could not save: storage is full or blocked"); }
}

/* ---------------- utils ---------------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
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
var toastTimer;
function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600); }
function entryTotals(e) { return P.totals(e.items); }
function dayTotals(k) { return P.totals([].concat.apply([], state.foods.filter(function (e) { return dayKey(e.ts) === k; }).map(function (e) { return e.items; }))); }

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
$$(".seg button").forEach(function (b) { b.addEventListener("click", function () { showSub(b.dataset.sub); }); });

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
function needsOnline(it) { return it.source === "manual" || (it.source === "db" && it.score < 50); }
function enrichOnline(items) {
  if (!state.settings.online || !navigator.onLine) return Promise.resolve({ items: items, error: null });
  var err = null;
  return Promise.all(items.map(function (it) {
    if (!needsOnline(it)) return it;
    return P.usdaSearch(it.name || it.text, state.settings.fdcKey || "DEMO_KEY").then(function (res) {
      if (res) { var keepGuess = it.source === "db"; P.applyUsda(it, res); if (keepGuess) it.note += " (local guess replaced)"; }
      return it;
    }).catch(function (e) { err = e.message; return it; });
  })).then(function (r) { return { items: r, error: err }; });
}
function itemsFromText(text, withRecipes) {
  return P.parsePhrase(text, INDEX, { recipes: withRecipes === false ? [] : state.recipes });
}
function cleanItem(it) {
  var o = { text: it.text, qty: it.qty, unit: it.unit || "", food: it.food, source: it.source, matched: !!it.matched,
    kcal: +it.kcal || 0, p: +it.p || 0, c: +it.c || 0, f: +it.f || 0 };
  if (it.grams) o.grams = it.grams; if (it.note) o.note = it.note; if (it.recipeId) o.recipeId = it.recipeId; if (it.fdcId) o.fdcId = it.fdcId;
  return o;
}

/* ---------------- food log ---------------- */
var foodInput = $("#food-input"), previewTimer;
function renderPreview() {
  var v = foodInput.value.trim(), el = $("#food-preview");
  if (!v) { el.innerHTML = ""; return; }
  var items = itemsFromText(v);
  el.innerHTML = items.map(function (it) {
    var miss = !it.matched;
    return '<div class="it' + (miss ? " miss" : "") + '"><span>' + esc((it.qty !== 1 || it.unit ? n1(it.qty) + (it.unit ? " " + it.unit : "") + " \u00d7 " : "") + it.food) +
      (miss ? (state.settings.online ? " \u2014 will check USDA" : " \u2014 not found, edit after logging") : "") + "</span><span>" + (miss ? "?" : n0(it.kcal) + " kcal") + "</span></div>";
  }).join("");
}
foodInput.addEventListener("input", function () { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 150); });
function resetWhen() { $("#food-when").value = toLocalInput(new Date()); }

function logFood(text, when) {
  text = (text || "").trim();
  if (!text) { toast("Type or say what you ate"); return Promise.resolve(null); }
  var btn = $("#food-log"); btn.disabled = true; btn.textContent = "Looking up\u2026";
  var items = itemsFromText(text);
  return enrichOnline(items).then(function (r) {
    var entry = { id: uid(), ts: (when || new Date()).toISOString(), text: text, items: r.items.map(cleanItem) };
    state.foods.push(entry); save();
    foodInput.value = ""; renderPreview(); resetWhen(); renderAll();
    var t = entryTotals(entry), miss = entry.items.filter(function (i) { return !i.matched; });
    toast("Logged " + n0(t.kcal) + " kcal" + (miss.length ? " \u2014 add macros for " + miss.length + " item(s)" : ""));
    if (r.error) $("#mic-status").className = "hint warn", $("#mic-status").textContent = r.error;
    if (miss.length) openEditor(entry.id);
    return entry;
  }).finally(function () { btn.disabled = false; btn.textContent = "Log it"; });
}
$("#food-form").addEventListener("submit", function (e) { e.preventDefault(); logFood(foodInput.value, fromLocalInput($("#food-when").value)); });
setupMic($("#food-mic"), $("#mic-status"), function (t) { foodInput.value = t; renderPreview(); },
  function (t) { foodInput.value = t; renderPreview(); logFood(t, fromLocalInput($("#food-when").value)); });

function logRecipe(id, qty, when) {
  var r = state.recipes.filter(function (x) { return x.id === id; })[0];
  qty = +qty || 1; if (!r) return null;
  var ps = r.perServing || { kcal: 0, p: 0, c: 0, f: 0 };
  var label = r.name + " (" + n1(qty) + (qty === 1 ? " serving)" : " servings)");
  var entry = { id: uid(), ts: (when || new Date()).toISOString(), text: label, items: [{ text: label, qty: qty, unit: "serving", food: label, source: "recipe",
    recipeId: r.id, matched: true, kcal: Math.round(ps.kcal * qty), p: P.round1(ps.p * qty), c: P.round1(ps.c * qty), f: P.round1(ps.f * qty) }] };
  state.foods.push(entry); save(); renderAll(); toast("Logged " + label + " \u2014 " + n0(entry.items[0].kcal) + " kcal");
  return entry;
}
$("#rq-log").addEventListener("click", function () { var id = $("#rq-select").value; if (id) logRecipe(id, $("#rq-qty").value, fromLocalInput($("#food-when").value)); });

function entryHTML(e, compact) {
  var t = entryTotals(e);
  if (compact) return '<li><div><div class="t">' + esc(e.text) + '</div><div class="m">' + fmtTime(e.ts) + " \u00b7 P " + n0(t.p) + " C " + n0(t.c) + " F " + n0(t.f) + '</div></div><div class="k">' + n0(t.kcal) + " kcal</div></li>";
  return '<div class="entry" data-id="' + e.id + '"><div class="top"><div><div class="t"><b>' + esc(e.text) + '</b></div><div class="when">' + fmtTime(e.ts) + '</div></div><div class="k"><b>' + n0(t.kcal) + ' kcal</b><div class="macros">P ' + n1(t.p) + " \u00b7 C " + n1(t.c) + " \u00b7 F " + n1(t.f) + "</div></div></div>" +
    '<ul class="items">' + e.items.map(function (i) {
      return '<li class="' + (i.matched ? "" : "miss") + '"><span>' + esc(i.food) + (i.matched ? "" : " \u2014 needs macros") + (i.note ? " \u00b7 " + esc(i.note) : "") + "</span><span>" + n0(i.kcal) + " kcal \u00b7 " + n1(i.p) + "/" + n1(i.c) + "/" + n1(i.f) + "</span></li>";
    }).join("") + '</ul><div class="acts"><button data-act="edit">Edit</button><button data-act="del" class="del">Delete</button></div></div>';
}
function renderFood() {
  var byDay = {};
  state.foods.forEach(function (e) { (byDay[dayKey(e.ts)] = byDay[dayKey(e.ts)] || []).push(e); });
  var days = Object.keys(byDay).sort().reverse();
  var html = days.length ? "" : '<div class="card"><div class="empty">No food logged yet. Try typing \u201ctwo eggs and toast\u201d.</div></div>';
  days.slice(0, 60).forEach(function (k) {
    var list = byDay[k].sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); }), t = dayTotals(k);
    html += '<div class="card day"><h3><span>' + fmtDay(k) + '</span><span>' + n0(t.kcal) + ' kcal</span></h3><div class="tot">Protein ' + n1(t.p) + " g \u00b7 Carbs " + n1(t.c) + " g \u00b7 Fat " + n1(t.f) + " g</div>" + list.map(function (e) { return entryHTML(e); }).join("") + "</div>";
  });
  $("#food-days").innerHTML = html;
  var sel = $("#rq-select"), cur = sel.value;
  $("#recipe-quick").hidden = !state.recipes.length;
  sel.innerHTML = state.recipes.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (r) {
    return '<option value="' + r.id + '">' + esc(r.name) + " \u2014 " + n0(r.perServing && r.perServing.kcal) + " kcal/srv</option>"; }).join("");
  if (cur) sel.value = cur;
}
$("#food-days").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-act]"); if (!b) return;
  var id = b.closest(".entry").dataset.id;
  if (b.dataset.act === "del") { if (confirm("Delete this entry?")) { state.foods = state.foods.filter(function (e) { return e.id !== id; }); save(); renderAll(); } }
  else openEditor(id);
});

/* ---------------- edit dialog ---------------- */
var dlg = $("#edit-dialog"), editing = null;
function itemRow(i) {
  return '<div class="eitem"><input class="e-name" value="' + esc(i.food) + '" aria-label="Item">' +
    ["kcal", "p", "c", "f"].map(function (k) { return '<input class="e-' + k + '" type="number" step="any" min="0" inputmode="decimal" value="' + (k === "kcal" ? n0(i[k]) : n1(i[k])) + '" aria-label="' + k + '">'; }).join("") +
    '<button type="button" class="x" aria-label="Remove item">\u00d7</button></div>';
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
    if (base.food !== name || base.kcal !== o.kcal || base.p !== o.p || base.c !== o.c || base.f !== o.f) { if (base.source && base.source !== "manual") o.note = (base.note ? base.note + "; " : "") + "edited"; if (base.matched === false) o.source = "manual"; }
    return o;
  });
}
function openEditor(id) {
  var e = state.foods.filter(function (x) { return x.id === id; })[0]; if (!e) return;
  editing = JSON.parse(JSON.stringify(e));
  $("#e-text").value = e.text; $("#e-when").value = toLocalInput(e.ts);
  renderEditItems(editing.items);
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  var miss = $$("#e-items .eitem").filter(function (r, i) { return !editing.items[i].matched; })[0];
  if (miss) setTimeout(function () { $(".e-kcal", miss).select(); }, 60);
}
$("#e-items").addEventListener("click", function (ev) {
  if (!ev.target.classList.contains("x")) return;
  var rows = $$("#e-items .eitem"), idx = rows.indexOf(ev.target.closest(".eitem"));
  editing.items = readEditItems(); editing.items.splice(idx, 1); renderEditItems(editing.items);
});
$("#e-additem").addEventListener("click", function () { editing.items = readEditItems(); editing.items.push({ food: "", kcal: 0, p: 0, c: 0, f: 0, matched: false }); renderEditItems(editing.items); });
$("#e-reparse").addEventListener("click", function () {
  var b = this; b.disabled = true;
  enrichOnline(itemsFromText($("#e-text").value)).then(function (r) { editing.items = r.items.map(cleanItem); renderEditItems(editing.items); }).finally(function () { b.disabled = false; });
});
$("#edit-form").addEventListener("submit", function (ev) {
  if (ev.submitter && ev.submitter.value !== "save") { editing = null; return; }
  var items = readEditItems().filter(function (i) { return i.food; });
  var idx = state.foods.findIndex(function (x) { return x.id === editing.id; });
  if (idx >= 0) {
    state.foods[idx] = Object.assign(state.foods[idx], { text: $("#e-text").value.trim() || state.foods[idx].text, ts: fromLocalInput($("#e-when").value).toISOString(), items: items.map(cleanItem) });
    save(); renderAll(); toast("Entry updated");
  }
  editing = null;
});

/* ---------------- today ---------------- */
function bar(label, val, goal, color, unit) {
  var pct = goal > 0 ? Math.min(100, val / goal * 100) : 0;
  return '<div class="bar"><div class="bar-top"><span><b>' + label + '</b></span><span>' + n0(val) + " / " + n0(goal) + " " + unit + '</span></div><div class="track"><div class="fill" style="width:' + pct.toFixed(1) + "%;background:" + (val > goal * 1.05 ? "var(--warn)" : color) + '"></div></div></div>';
}
function renderToday() {
  var g = state.goals, t = dayTotals(todayKey());
  $("#today-date").textContent = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  $("#kcal-eaten").textContent = n0(t.kcal); $("#kcal-goal").textContent = n0(g.kcal);
  var left = g.kcal - t.kcal, pill = $("#kcal-left");
  pill.textContent = left >= 0 ? n0(left) + " kcal left" : n0(-left) + " kcal over"; pill.classList.toggle("over", left < 0);
  var C = 2 * Math.PI * 50, frac = g.kcal > 0 ? Math.min(1, t.kcal / g.kcal) : 0, fg = $("#ring-fg");
  fg.style.strokeDasharray = C.toFixed(2); fg.style.strokeDashoffset = (C * (1 - frac)).toFixed(2); fg.classList.toggle("over", left < 0);
  $("#macro-bars").innerHTML = bar("Protein", t.p, g.p, "var(--p)", "g") + bar("Carbs", t.c, g.c, "var(--c)", "g") + bar("Fat", t.f, g.f, "var(--f)", "g");
  var list = state.foods.filter(function (e) { return dayKey(e.ts) === todayKey(); }).sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
  $("#today-entries").innerHTML = list.length ? list.map(function (e) { return entryHTML(e, true); }).join("") : '<li class="empty">Nothing logged yet today.</li>';
  var ws = sortedWeights();
  if (ws.length) {
    var last = ws[ws.length - 1], prev = ws.length > 1 ? ws[ws.length - 2] : null;
    $("#w-latest").textContent = n1(last.lb) + " lb";
    var to = last.lb - g.weight;
    $("#w-latest-sub").textContent = fmtShort(last.date) + (prev ? " \u00b7 " + (last.lb - prev.lb >= 0 ? "+" : "") + n1(last.lb - prev.lb) + " lb" : "") + " \u00b7 " + (Math.abs(to) < 0.05 ? "at goal" : n1(Math.abs(to)) + " lb " + (to > 0 ? "above" : "below") + " goal");
    $("#w-spark").innerHTML = weightChart(ws.slice(-14), g.weight, true);
  } else { $("#w-latest").innerHTML = "&mdash;"; $("#w-latest-sub").textContent = "No weigh-ins yet"; $("#w-spark").innerHTML = ""; }
}

/* ---------------- weight ---------------- */
function sortedWeights() { return state.weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
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
  var ws = sortedWeights(), g = state.goals.weight;
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
  var d = $("#w-date").value || todayKey(), v = parseFloat($("#w-value").value);
  if (!(v > 0)) { toast("Enter your weight in lb"); return; }
  var ex = state.weights.filter(function (w) { return w.date === d; })[0];
  if (ex) { ex.lb = v; toast("Updated " + fmtShort(d) + " to " + n1(v) + " lb"); }
  else { state.weights.push({ id: uid(), date: d, lb: v }); toast("Logged " + n1(v) + " lb"); }
  save(); $("#w-value").value = ""; renderAll();
});
$("#w-list").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-id]"); if (!b) return;
  if (confirm("Delete this weigh-in?")) { state.weights = state.weights.filter(function (w) { return w.id !== b.dataset.id; }); save(); renderAll(); }
});

/* ---------------- recipes ---------------- */
var rEdit = null; // {id, rows:[item]}
function recipeTotals(rows) { return P.totals(rows); }
function perServing(t, s) { s = Math.max(1, +s || 1); return { kcal: Math.round(t.kcal / s), p: P.round1(t.p / s), c: P.round1(t.c / s), f: P.round1(t.f / s) }; }
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
  row[inp.dataset.k] = +inp.value || 0; row.matched = true; if (row.source !== "manual") row.note = "edited"; row.edited = true;
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
  var current = rEdit.rows.map(function (r) { return r.text; }).join("\n");
  var go = current === lines.join("\n") ? Promise.resolve() : calcRecipe();
  go.then(function () {
    if (!rEdit.rows.length) { toast("Add at least one ingredient"); return; }
    var servings = Math.max(1, +$("#re-servings").value || 1), t = recipeTotals(rEdit.rows);
    var rec = { id: rEdit.id || uid(), name: name, servings: servings, ingredients: rEdit.rows.map(function (r) { return { text: r.text, qty: r.qty, unit: r.unit, food: r.food, source: r.source, matched: r.matched, grams: r.grams, note: r.note, edited: r.edited, kcal: r.kcal, p: r.p, c: r.c, f: r.f }; }),
      totals: t, perServing: perServing(t, servings), updated: new Date().toISOString() };
    var i = state.recipes.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) state.recipes[i] = rec; else state.recipes.push(rec);
    save(); toast("Saved " + name + " \u2014 " + n0(rec.perServing.kcal) + " kcal per serving"); closeRecipe();
  });
});

/* ---------------- goals & settings ---------------- */
function fillGoals() {
  var g = state.goals;
  $("#g-kcal").value = g.kcal; $("#g-p").value = g.p; $("#g-c").value = g.c; $("#g-f").value = g.f; $("#g-weight").value = g.weight;
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
  ["kcal", "p", "c", "f", "weight"].forEach(function (k) { var v = parseFloat($("#g-" + k).value); if (v >= 0) state.goals[k] = v; });
  save(); renderAll(); $("#g-saved").textContent = "Saved."; setTimeout(function () { $("#g-saved").textContent = ""; }, 2000);
});
$("#g-reset").addEventListener("click", function () { state.goals = Object.assign({}, DEFAULT_GOALS); save(); fillGoals(); renderAll(); toast("Goals reset to defaults"); });
$("#settings-form").addEventListener("submit", function (e) {
  e.preventDefault(); state.settings.online = $("#s-online").checked; state.settings.fdcKey = $("#s-key").value.trim(); save();
  $("#s-saved").textContent = "Saved."; setTimeout(function () { $("#s-saved").textContent = ""; }, 2000);
});
$("#d-export").addEventListener("click", function () {
  var data = Object.assign({ exportedAt: new Date().toISOString(), app: "Cadence" }, state);
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "cadence-backup-" + todayKey() + ".json";
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast("Exported backup");
});
$("#d-import").addEventListener("click", function () { $("#d-file").click(); });
$("#d-file").addEventListener("change", function () {
  var file = this.files[0]; if (!file) return;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var d = JSON.parse(rd.result);
      if (!d || (!Array.isArray(d.foods) && !Array.isArray(d.weights) && !Array.isArray(d.recipes))) throw new Error("Not a Cadence backup");
      var nd = sanitize(d);
      if (confirm("Replace the data in this browser with the backup? (" + nd.foods.length + " food entries, " + nd.weights.length + " weigh-ins, " + nd.recipes.length + " recipes)")) {
        state = nd; save(); fillGoals(); renderAll(); toast("Imported backup");
      }
    } catch (e) { toast("Import failed: " + e.message); }
  };
  rd.readAsText(file); this.value = "";
});
$("#d-clear").addEventListener("click", function () {
  if (confirm("Delete ALL Cadence data in this browser? Export a backup first if you need it.")) { state = blank(); save(); fillGoals(); renderAll(); toast("All data cleared"); }
});
function renderInfo() {
  $("#d-info").textContent = state.foods.length + " food entries \u00b7 " + state.weights.length + " weigh-ins \u00b7 " + state.recipes.length + " recipes \u00b7 " + FOODS.length + " foods in the built-in list";
}

/* ---------------- boot ---------------- */
function renderAll() { renderToday(); renderFood(); renderWeight(); renderRecipeList(); renderInfo(); }
$("#w-date").value = todayKey(); resetWhen(); fillGoals();
showTab((location.hash || "#today").slice(1));
window.addEventListener("hashchange", function () { showTab(location.hash.slice(1)); });
window.addEventListener("storage", function (e) { if (e.key === KEY) { state = load(); fillGoals(); renderAll(); } });
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
// test hook
window.Cadence = { get state() { return state; }, logFood: logFood, logRecipe: logRecipe, reload: function () { state = load(); renderAll(); } };
})();
