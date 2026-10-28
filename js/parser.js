/* Cadence food phrase parser + nutrition lookup.
 * Works in the browser (window.CadenceParser) and in Node (module.exports) for tests.
 */
(function (root) {
"use strict";

var NUM_WORDS = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18,
  nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, couple:2, few:3, several:3, dozen:12, single:1,
  double:2, triple:3 };
var FRACTIONS = { "½":" 1/2", "¼":" 1/4", "¾":" 3/4", "⅓":" 1/3", "⅔":" 2/3", "⅛":" 1/8" };

// unit -> kind. kinds: g (grams per unit fixed), cup, tbsp, tsp, piece, serving
var UNITS = {
  g:{g:1}, gram:{g:1}, grams:{g:1}, gr:{g:1}, kg:{g:1000}, kilogram:{g:1000}, kilograms:{g:1000},
  oz:{g:28.35}, ounce:{g:28.35}, ounces:{g:28.35}, lb:{g:453.6}, lbs:{g:453.6}, pound:{g:453.6}, pounds:{g:453.6},
  ml:{g:1}, milliliter:{g:1}, milliliters:{g:1}, liter:{g:1000}, liters:{g:1000}, pint:{g:473}, pints:{g:473},
  handful:{g:28}, handfuls:{g:28},
  cup:{k:"cup"}, cups:{k:"cup"}, c:{k:"cup"}, mug:{k:"cup"}, mugs:{k:"cup"},
  tbsp:{k:"tbsp"}, tbs:{k:"tbsp"}, tbl:{k:"tbsp"}, tablespoon:{k:"tbsp"}, tablespoons:{k:"tbsp"},
  tsp:{k:"tsp"}, teaspoon:{k:"tsp"}, teaspoons:{k:"tsp"},
  slice:{k:"piece"}, slices:{k:"piece"}, piece:{k:"piece"}, pieces:{k:"piece"}, pc:{k:"piece"}, pcs:{k:"piece"},
  each:{k:"piece"}, whole:{k:"piece"}, stick:{k:"piece"}, sticks:{k:"piece"}, strip:{k:"piece"}, strips:{k:"piece"},
  link:{k:"piece"}, links:{k:"piece"}, patty:{k:"piece"}, patties:{k:"piece"}, can:{k:"piece"}, cans:{k:"piece"},
  bottle:{k:"piece"}, bottles:{k:"piece"}, scoop:{k:"piece"}, scoops:{k:"piece"}, packet:{k:"piece"}, packets:{k:"piece"},
  bar:{k:"piece"}, bars:{k:"piece"}, container:{k:"piece"}, containers:{k:"piece"}, order:{k:"piece"}, orders:{k:"piece"},
  spear:{k:"piece"}, spears:{k:"piece"}, fillet:{k:"piece"}, fillets:{k:"piece"}, wedge:{k:"piece"}, wedges:{k:"piece"},
  serving:{k:"serving"}, servings:{k:"serving"}, bowl:{k:"serving"}, bowls:{k:"serving"}, plate:{k:"serving"},
  plates:{k:"serving"}, portion:{k:"serving"}, portions:{k:"serving"}, helping:{k:"serving"}, helpings:{k:"serving"},
  glass:{k:"serving"}, glasses:{k:"serving"}
};
var FILLER = ["of","some","the","my","a","an","large","medium","small","big","little","extra","fresh","plain","regular","homemade","bit","few"];
var LEAD = /^(?:(?:so\s+)?(?:i|we)\s+(?:just\s+)?(?:had|ate|drank|got)|had|ate|drank|log|add)\s+/;
var TAIL = /\s+(?:for|at)\s+(?:breakfast|lunch|dinner|supper|brunch|a snack|snack|dessert)\b.*$|\s+(?:this morning|this afternoon|tonight|today|earlier)\s*$/;

function round1(x) { return Math.round(x * 10) / 10; }
function round0(x) { return Math.round(x); }

function singular(w) {
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2);
  if (/oes$/.test(w)) return w.slice(0, -2);
  if (/(ss|us|is)$/.test(w)) return w;
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}
function keyOf(s) {
  return normalize(s).replace(/[,;&+]/g, " ").split(" ").filter(Boolean).map(singular).join(" ");
}
function normalize(s) {
  s = String(s || "").toLowerCase();
  for (var k in FRACTIONS) s = s.split(k).join(FRACTIONS[k]);
  s = s.replace(/[’']/g, "").replace(/[^a-z0-9\/.,;&%+\s-]/g, " ").replace(/\.(?!\d)/g, " ");
  s = s.replace(/(\d)\s*(g|oz|lb|lbs|ml|kg)\b/g, "$1 $2");
  s = s.replace(/(\d)-(\d)/g, "$1 to $2");
  s = s.replace(/-/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/* ---------- index ---------- */
function buildIndex(foods) {
  var exact = {}, list = [];
  foods.forEach(function (f) {
    f.aliases.concat([f.name]).forEach(function (a) {
      var k = keyOf(a);
      if (!k) return;
      if (!(k in exact)) exact[k] = f;
      list.push({ key: k, food: f, re: new RegExp("(^| )" + escapeRe(k) + "( |$)") });
    });
  });
  list.sort(function (a, b) { return b.key.length - a.key.length; });
  var protect = [];
  foods.forEach(function (f) { f.aliases.forEach(function (a) {
    var n = normalize(a); if (/ (and|with) |&/.test(n)) protect.push(n); }); });
  protect.sort(function (a, b) { return b.length - a.length; });
  return { exact: exact, list: list, protect: protect, foods: foods };
}

/* ---------- phrase splitting ---------- */
function splitPhrase(text, index, recipes) {
  var s = normalize(text);
  s = s.replace(LEAD, "").replace(TAIL, "");
  // "one and a half cups" -> "1.5 cups"
  s = s.replace(/\b(\d+|a|an|one|two|three|four|five)\s+and\s+(?:a\s+)?half\b/g, function (m, n) {
    var v = /^\d+$/.test(n) ? +n : (n === "a" || n === "an") ? 1 : NUM_WORDS[n]; return String(v + 0.5); });
  var prot = index.protect.slice();
  (recipes || []).forEach(function (r) { var n = normalize(r.name); if (/ (and|with) |&/.test(n)) prot.push(n); });
  prot.sort(function (a, b) { return b.length - a.length; });
  prot.forEach(function (p) {
    var re = new RegExp("(^| )" + escapeRe(p) + "(?= |$)", "g");
    s = s.replace(re, function (m, pre) { return pre + p.replace(/ and /g, " \u2227 ").replace(/ with /g, " \u2228 ").replace(/&/g, "\u2295"); });
  });
  var parts = s.split(/\s*(?:,|;|\+|&|\bplus\b|\balong with\b|\band then\b|\band\b|\bwith\b|\bthen\b|\balso\b)\s*/);
  return parts.map(function (p) {
    return p.replace(/\u2227/g, "and").replace(/\u2228/g, "with").replace(/\u2295/g, "&").replace(/\s+/g, " ").trim();
  }).filter(function (p) { return p && !/^(a|an|some|the|and)$/.test(p); });
}

/* ---------- quantity + unit ---------- */
function parseNumberToken(t) {
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  if (/^\.\d+$/.test(t)) return parseFloat(t);
  var m = /^(\d+)\/(\d+)$/.exec(t); if (m && +m[2]) return +m[1] / +m[2];
  if (t in NUM_WORDS) return NUM_WORDS[t];
  return null;
}
function parseQty(seg) {
  var toks = seg.split(" ").filter(Boolean), i = 0, qty = null, unit = null;
  function peek(k) { return toks[i + (k || 0)]; }
  if (peek() === "half") { qty = 0.5; i++; if (peek() === "of") i++; if (peek() === "a" || peek() === "an") i++; }
  else if ((peek() === "a" || peek() === "an") && peek(1) === "half") { qty = 0.5; i += 2; if (peek() === "of") i++; }
  else if ((peek() === "a" || peek() === "an") && peek(1) === "quarter") { qty = 0.25; i += 2; if (peek() === "of") i++; }
  else if ((peek() === "a" || peek() === "an") && peek(1) in NUM_WORDS && NUM_WORDS[peek(1)] > 1) { qty = NUM_WORDS[peek(1)]; i += 2; }
  else if (peek() === "a" || peek() === "an") { qty = 1; i++; }
  else {
    var n = peek() !== undefined ? parseNumberToken(peek()) : null;
    if (n !== null) {
      qty = n; i++;
      var fr = peek() !== undefined && /^\d+\/\d+$/.test(peek()) ? parseNumberToken(peek()) : null;
      if (fr !== null && qty >= 1 && qty % 1 === 0) { qty += fr; i++; }
      if (peek() === "to" && peek(1) !== undefined && parseNumberToken(peek(1)) !== null) { qty = (qty + parseNumberToken(peek(1))) / 2; i += 2; }
      if (peek() === "dozen") { qty *= 12; i++; }
      if (peek() === "half" && qty === 1) { i++; } // "one half" handled loosely
    }
  }
  if (peek() === "fl" && (peek(1) === "oz" || peek(1) === "ounce" || peek(1) === "ounces")) i++;
  if (peek() !== undefined && UNITS[peek()] && !(peek() === "c" && toks.length === i + 1)) {
    unit = peek(); i++;
  }
  var rest = toks.slice(i);
  // trailing quantity: "rice 2 cups", "chicken 200 g"
  if (qty === null && rest.length >= 2) {
    var L = rest.length;
    if (UNITS[rest[L - 1]] && parseNumberToken(rest[L - 2]) !== null) { qty = parseNumberToken(rest[L - 2]); unit = rest[L - 1]; rest = rest.slice(0, L - 2); }
    else if (parseNumberToken(rest[L - 1]) !== null && /^\d/.test(rest[L - 1])) { qty = parseNumberToken(rest[L - 1]); rest = rest.slice(0, L - 1); }
    else if (rest[0] === "x" || /^x\d+$/.test(rest[L - 1])) { /* ignore */ }
  }
  while (rest.length && FILLER.indexOf(rest[0]) >= 0) rest.shift();
  return { qty: qty === null ? 1 : qty, qtyGiven: qty !== null, unit: unit, name: rest.join(" ").trim() };
}

/* ---------- matching ---------- */
function matchFood(name, index) {
  var k = keyOf(name);
  if (!k) return null;
  if (index.exact[k]) return { food: index.exact[k], score: 100 };
  var nw = k.split(" ").length;
  for (var i = 0; i < index.list.length; i++) {
    if (index.list[i].re.test(k)) {
      var cov = index.list[i].key.split(" ").length / nw;
      return { food: index.list[i].food, score: cov >= 0.5 ? 60 : 40 };
    }
  }
  // token overlap fallback
  var words = k.split(" ").filter(function (w) { return w.length > 2; });
  if (!words.length) return null;
  var best = null, bestScore = 0;
  index.list.forEach(function (e) {
    var aw = e.key.split(" ");
    var common = words.filter(function (w) { return aw.indexOf(w) >= 0; }).length;
    var sc = common / Math.max(words.length, aw.length);
    if (common && sc > bestScore) { bestScore = sc; best = e.food; }
  });
  return bestScore >= 0.5 ? { food: best, score: 30 } : null;
}
function matchRecipe(name, recipes) {
  if (!recipes || !recipes.length) return null;
  var k = keyOf(name); if (!k) return null;
  var best = null, bestLen = 0;
  recipes.forEach(function (r) {
    var rk = keyOf(r.name); if (!rk) return;
    if (rk === k) { if (rk.length + 1000 > bestLen) { best = r; bestLen = rk.length + 1000; } return; }
    var re = new RegExp("(^| )" + escapeRe(rk) + "( |$)");
    if (re.test(k) && rk.length > bestLen) { best = r; bestLen = rk.length; }
  });
  return best;
}

/* grams for qty+unit of a bundled food */
function gramsFor(food, qty, unit) {
  var u = unit ? UNITS[unit] : null, note = "";
  if (!u) return { grams: qty * (food.pieceG || food.grams), note: note };
  if (u.g) return { grams: qty * u.g, note: note };
  if (u.k === "cup" || u.k === "tbsp" || u.k === "tsp") {
    var div = u.k === "cup" ? 1 : u.k === "tbsp" ? 16 : 48;
    if (food.cupG) return { grams: qty * food.cupG / div, note: note };
    // no volume data: tbsp/tsp of a food whose serving is tbsp/tsp-based
    if (u.k !== "cup" && /tbsp|tsp/.test(food.label)) {
      var base = /(\d+(?:\.\d+)?)\s*tbsp/.exec(food.label) ? 16 : 48;
      var cnt = parseFloat(food.label) || 1;
      return { grams: qty * food.grams / cnt * (base / div), note: note };
    }
    return { grams: qty * food.grams, note: "no " + unit + " size on file; counted as servings" };
  }
  if (u.k === "piece") return { grams: qty * (food.pieceG || food.grams), note: note };
  return { grams: qty * food.grams, note: note };
}

function fmtQty(q) { return (Math.round(q * 100) / 100).toString(); }

/* Nutrient numbers verified against FoodData Central nutrient.csv (SR Legacy):
 * 291 fiber, 269 sugars total, 307 sodium, 306 potassium, 301 calcium, 303 iron,
 * 304 magnesium, 320 vitamin A RAE, 401 vitamin C, 328 vitamin D (D2+D3) µg, 418 B12. */
var MICRO_KEYS = ["fiber", "sugar", "sodium", "potassium", "calcium", "iron", "magnesium", "vita", "vitc", "vitd", "b12"];
var USDA_MICRO = { fiber: ["291"], sugar: ["269"], sodium: ["307"], potassium: ["306"], calcium: ["301"], iron: ["303"], magnesium: ["304"], vita: ["320"], vitc: ["401"], vitd: ["328"], b12: ["418"] };
function roundMicro(k, v) {
  var p = (k === "sodium" || k === "potassium" || k === "calcium" || k === "magnesium") ? 10 : 100;
  return Math.round(v * p) / p;
}
function scaleMicros(micros, mult) {
  if (!micros) return null;
  var o = {};
  MICRO_KEYS.forEach(function (k) {
    if (micros[k] == null || micros[k] === "") o[k] = null;
    else o[k] = roundMicro(k, +micros[k] * mult);
  });
  return o;
}
function sumMicros(items) {
  var vals = {}, gap = {}, legacy = false;
  MICRO_KEYS.forEach(function (k) { vals[k] = 0; gap[k] = false; });
  (items || []).forEach(function (it) {
    if (!it || !it.micros) { legacy = true; MICRO_KEYS.forEach(function (k) { gap[k] = true; }); return; }
    MICRO_KEYS.forEach(function (k) {
      if (it.micros[k] == null) gap[k] = true;
      else vals[k] += +it.micros[k];
    });
  });
  var out = {};
  MICRO_KEYS.forEach(function (k) { out[k] = gap[k] ? null : roundMicro(k, vals[k]); });
  return out;
}
/* Day/recipe display: known amounts are summed; missing values are flagged, never treated as zero. */
function collectMicros(items) {
  var acc = {}, legacy = 0;
  MICRO_KEYS.forEach(function (k) { acc[k] = { sum: 0, known: 0, missing: 0 }; });
  (items || []).forEach(function (it) {
    if (!it || !it.micros) {
      legacy++;
      MICRO_KEYS.forEach(function (k) { acc[k].missing++; });
      return;
    }
    MICRO_KEYS.forEach(function (k) {
      if (it.micros[k] == null) acc[k].missing++;
      else { acc[k].sum += +it.micros[k]; acc[k].known++; }
    });
  });
  MICRO_KEYS.forEach(function (k) { acc[k].sum = roundMicro(k, acc[k].sum); });
  return { acc: acc, legacy: legacy };
}
function divideMicros(micros, servings) {
  return scaleMicros(micros, 1 / Math.max(1, +servings || 1));
}

function resolveSegment(seg, index, opts) {
  opts = opts || {};
  var pq = parseQty(seg);
  var base = { text: seg, qty: pq.qty, unit: pq.unit || "", name: pq.name || seg };
  if (opts.recipes && opts.recipes.length) {
    var r = matchRecipe(pq.name || seg, opts.recipes) || matchRecipe(seg, opts.recipes);
    if (r) {
      var q = pq.qty, ps = r.perServing || { kcal: 0, p: 0, c: 0, f: 0 };
      return Object.assign(base, { source: "recipe", recipeId: r.id, food: r.name + " (" + fmtQty(q) + (q === 1 ? " serving" : " servings") + ")",
        servings: q, matched: true, kcal: round0(ps.kcal * q), p: round1(ps.p * q), c: round1(ps.c * q), f: round1(ps.f * q),
        micros: scaleMicros(ps.micros, q) });
    }
  }
  var m = matchFood(pq.name || seg, index);
  if (!m) return Object.assign(base, { source: "manual", food: pq.name || seg, matched: false, kcal: 0, p: 0, c: 0, f: 0, servings: pq.qty, micros: null });
  var f = m.food, g = gramsFor(f, pq.qty, pq.unit), mult = g.grams / f.grams;
  return Object.assign(base, { source: "db", foodId: f.id, food: f.name, label: f.label, grams: round0(g.grams), servings: round1(mult * 100) / 100,
    matched: true, score: m.score, note: g.note || (m.score < 50 ? "best guess \u2014 check" : ""), kcal: round0(f.kcal * mult), p: round1(f.p * mult), c: round1(f.c * mult), f: round1(f.f * mult),
    fdcId: f.fdcId || null, micros: scaleMicros(f.micros, mult) });
}

function parsePhrase(text, index, opts) {
  return splitPhrase(text, index, opts && opts.recipes).map(function (seg) { return resolveSegment(seg, index, opts); });
}
function totals(items) {
  var t = { kcal: 0, p: 0, c: 0, f: 0 };
  (items || []).forEach(function (i) { t.kcal += +i.kcal || 0; t.p += +i.p || 0; t.c += +i.c || 0; t.f += +i.f || 0; });
  return { kcal: round0(t.kcal), p: round1(t.p), c: round1(t.c), f: round1(t.f) };
}

/* ---------- USDA FoodData Central fallback ---------- */
function nutrientVal(food, nums, names) {
  var ns = food.foodNutrients || [];
  for (var i = 0; i < ns.length; i++) {
    var n = ns[i], nut = n.nutrient || {};
    var num = n.nutrientNumber != null ? n.nutrientNumber : nut.number;
    var unit = n.unitName || nut.unitName || "";
    var val = n.value != null ? n.value : n.amount;
    if (nums.indexOf(String(num)) >= 0 && String(unit).toUpperCase() !== "KJ") {
      if (val == null || val === "") return null;
      return +val;
    }
  }
  if (names) {
    for (i = 0; i < ns.length; i++) {
      n = ns[i]; nut = n.nutrient || {};
      var nm = n.nutrientName || nut.name || "";
      unit = n.unitName || nut.unitName || "";
      val = n.value != null ? n.value : n.amount;
      if (names.test(nm) && String(unit).toUpperCase() === "KCAL") {
        if (val == null || val === "") return null;
        return +val;
      }
    }
  }
  return null;
}
function usdaMicros(food) {
  var o = {};
  MICRO_KEYS.forEach(function (k) { o[k] = nutrientVal(food, USDA_MICRO[k]); });
  return o;
}
function usdaSearch(query, apiKey, fetchImpl) {
  var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!f) return Promise.reject(new Error("fetch unavailable"));
  var url = fdcSearchUrl(query, "Foundation,SR Legacy,Survey (FNDDS)", apiKey, 5);
  return f(url).then(function (r) {
    if (r.status === 429) throw new Error("USDA rate limit reached (DEMO_KEY). Add your own key in Goals.");
    if (!r.ok) throw new Error("USDA lookup failed (" + r.status + ")");
    return r.json();
  }).then(function (j) {
    var foods = (j && j.foods) || [];
    var qt = normalize(query).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1; }).map(singular);
    for (var i = 0; i < foods.length; i++) {
      // relevance guard: at least half the query words must appear in the USDA description
      var desc = " " + normalize(foods[i].description || "").split(/[^a-z0-9]+/).map(singular).join(" ") + " ";
      var hit = qt.filter(function (w) { return desc.indexOf(" " + w + " ") >= 0; }).length;
      if (qt.length && hit / qt.length < 0.5) continue;
      var kcal = nutrientVal(foods[i], ["208", "957", "958"], /energy/i);
      if (kcal === null) continue;
      return { fdcId: foods[i].fdcId, name: foods[i].description, per100: {
        kcal: kcal, p: nutrientVal(foods[i], ["203"], /^protein/i) || 0,
        c: nutrientVal(foods[i], ["205"], /carbohydrate/i) || 0, f: nutrientVal(foods[i], ["204"], /total lipid/i) || 0,
        micros: usdaMicros(foods[i]) } };
    }
    return null;
  });
}
/* Apply a USDA per-100g result to an unmatched item (mutates + returns it). */
function applyUsda(item, res) {
  var u = item.unit ? UNITS[item.unit] : null, grams, note;
  if (u && u.g) { grams = item.qty * u.g; note = "USDA, " + round0(grams) + " g"; }
  else if (u && u.k === "cup") { grams = item.qty * 240; note = "USDA, ~240 g per cup (estimate)"; }
  else if (u && u.k === "tbsp") { grams = item.qty * 15; note = "USDA, ~15 g per tbsp (estimate)"; }
  else if (u && u.k === "tsp") { grams = item.qty * 5; note = "USDA, ~5 g per tsp (estimate)"; }
  else { grams = item.qty * 100; note = "USDA, assumed 100 g each \u2014 check & edit"; }
  var m = grams / 100;
  item.source = "usda"; item.fdcId = res.fdcId; item.food = res.name; item.matched = true; item.grams = round0(grams); item.note = note;
  item.kcal = round0(res.per100.kcal * m); item.p = round1(res.per100.p * m); item.c = round1(res.per100.c * m); item.f = round1(res.per100.f * m);
  item.micros = scaleMicros(res.per100.micros, m);
  return item;
}

/* ---------- branded / web lookup ----------
 * Generic USDA (Foundation, SR Legacy, FNDDS) already returns some chain items,
 * for example McDonald's Chicken McNuggets. It does not query dataType=Branded.
 * Branded foods and Open Food Facts are a separate step. Nutritionix has no public
 * free developer key, so it is not called. */
var BRANDS = [
  { name: "McDonald's", words: ["mcdonalds", "mcdonald"] },
  { name: "Burger King", words: ["burger king"] },
  { name: "Wendy's", words: ["wendys"] },
  { name: "Chipotle", words: ["chipotle"] },
  { name: "Taco Bell", words: ["taco bell"] },
  { name: "Starbucks", words: ["starbucks"] },
  { name: "Subway", words: ["subway"] },
  { name: "KFC", words: ["kfc"] },
  { name: "Popeyes", words: ["popeyes"] },
  { name: "Chick-fil-A", words: ["chick fil a", "chickfila"] },
  { name: "Domino's", words: ["dominos"] },
  { name: "Pizza Hut", words: ["pizza hut"] },
  { name: "Panera", words: ["panera"] },
  { name: "Dunkin'", words: ["dunkin"] },
  { name: "Five Guys", words: ["five guys"] },
  { name: "In-N-Out", words: ["in n out", "innout"] },
  { name: "Shake Shack", words: ["shake shack"] },
  { name: "Arby's", words: ["arbys"] },
  { name: "Dairy Queen", words: ["dairy queen"] },
  { name: "Panda Express", words: ["panda express"] },
  { name: "Wingstop", words: ["wingstop"] },
  { name: "Whataburger", words: ["whataburger"] },
  { name: "Jack in the Box", words: ["jack in the box"] },
  { name: "Culver's", words: ["culvers"] },
  { name: "Qdoba", words: ["qdoba"] },
  { name: "Sweetgreen", words: ["sweetgreen"] },
  { name: "Papa John's", words: ["papa johns"] },
  { name: "Little Caesars", words: ["little caesars"] },
  { name: "Oreo", words: ["oreo", "oreos"] },
  { name: "Cheetos", words: ["cheetos", "cheeto"] },
  { name: "Doritos", words: ["doritos", "dorito"] },
  { name: "Lay's", words: ["lays"] },
  { name: "Pringles", words: ["pringles"] },
  { name: "KitKat", words: ["kit kat", "kitkat"] },
  { name: "Snickers", words: ["snickers"] },
  { name: "Twix", words: ["twix"] },
  { name: "Nutella", words: ["nutella"] },
  { name: "Cheez-It", words: ["cheez it"] },
  { name: "Goldfish", words: ["goldfish"] },
  { name: "Takis", words: ["takis"] },
  { name: "Skittles", words: ["skittles"] },
  { name: "Reese's", words: ["reeses"] },
  { name: "M&M's", words: ["m ms", "mms"] },
  { name: "Gatorade", words: ["gatorade"] },
  { name: "Red Bull", words: ["red bull"] },
  { name: "Quest", words: ["quest"] },
  { name: "Clif", words: ["clif"] },
  { name: "Pop-Tarts", words: ["pop tart", "poptart"] },
  { name: "Nature Valley", words: ["nature valley"] },
  { name: "Fritos", words: ["fritos"] },
  { name: "Tostitos", words: ["tostitos"] },
  { name: "Ben & Jerry's", words: ["ben and jerry", "ben jerry"] },
  { name: "Chobani", words: ["chobani"] },
  { name: "Fairlife", words: ["fairlife"] },
  { name: "Premier Protein", words: ["premier protein"] },
  { name: "RXBAR", words: ["rx bar", "rxbar"] }
];
var OFF_ORIGIN = "https://world.openfoodfacts.net";
function fdcSearchUrl(query, dataType, apiKey, pageSize) {
  var dt = String(dataType).replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + encodeURIComponent(apiKey || "DEMO_KEY") +
    "&query=" + encodeURIComponent(query) + "&pageSize=" + (pageSize || 20) + "&dataType=" + dt;
}
function fdcFoodUrl(fdcId, apiKey) {
  return "https://api.nal.usda.gov/fdc/v1/food/" + encodeURIComponent(fdcId) + "?api_key=" + encodeURIComponent(apiKey || "DEMO_KEY");
}
function httpJson(url, fetchImpl) {
  var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!f) return Promise.reject(new Error("fetch unavailable"));
  return f(url).then(function (r) {
    if (r.status === 429) throw new Error("USDA rate limit reached (DEMO_KEY). Add your own key in Goals.");
    if (!r.ok) throw new Error("Lookup failed (" + r.status + ")");
    return r.json();
  });
}
function numOrNull(v) {
  if (v == null || v === "" || isNaN(+v)) return null;
  return +v;
}
function blankMicroMap() {
  var o = {};
  MICRO_KEYS.forEach(function (k) { o[k] = null; });
  return o;
}
function per100FromUsdaFood(food) {
  var kcal = nutrientVal(food, ["208", "957", "958"], /energy/i);
  if (kcal === null) return null;
  var micro = usdaMicros(food);
  return {
    kcal: kcal,
    p: nutrientVal(food, ["203"], /^protein/i),
    c: nutrientVal(food, ["205"], /carbohydrate/i),
    f: nutrientVal(food, ["204"], /total lipid/i),
    micros: micro
  };
}
function detectBrand(text) {
  var k = keyOf(text);
  if (!k) return null;
  var padded = " " + k + " ";
  var best = null, bestLen = 0;
  BRANDS.forEach(function (b) {
    b.words.forEach(function (w) {
      var phrase = keyOf(w);
      if (!phrase) return;
      if (padded.indexOf(" " + phrase + " ") >= 0 && phrase.length > bestLen) { best = b; bestLen = phrase.length; }
    });
  });
  return best;
}
function brandTokens(brand) {
  var out = [];
  (brand ? brand.words : []).forEach(function (w) {
    keyOf(w).split(" ").forEach(function (t) { if (t && out.indexOf(t) < 0) out.push(t); });
  });
  return out;
}
function tokenHas(tokens, w) {
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i] === w) return true;
    if (w.length >= 5 && tokens[i].indexOf(w) >= 0) return true;
  }
  return false;
}
function mentionsBrand(brand, text) {
  if (!brand) return false;
  var tokens = keyOf(text).split(" ").filter(Boolean);
  return brand.words.some(function (w) {
    var parts = keyOf(w).split(" ").filter(Boolean);
    return parts.length && parts.every(function (p) { return tokenHas(tokens, p); });
  });
}
function localMissesBrand(item) {
  var brand = detectBrand((item && (item.name || item.text)) || "");
  if (!brand) return false;
  return !mentionsBrand(brand, (item.food || "") + " " + (item.label || ""));
}
function extraPenalty(query, cand) {
  var said = keyOf(query).split(" ");
  var nameTokens = keyOf(cand.name || "").split(" ");
  var extras = ["cereal", "muffin", "cheesecake", "cone", "popcorn", "creamer", "pudding", "coffee", "yogurt", "cake", "donut", "doughnut", "brownie", "pie", "shake", "latte", "crust", "topping", "syrup"];
  var pen = 0;
  extras.forEach(function (w) { if (said.indexOf(w) < 0 && nameTokens.indexOf(w) >= 0) pen += 25; });
  return pen;
}
function scoreCandidate(query, brand, cand) {
  var qTokens = keyOf(query).split(" ").filter(function (w) { return w.length > 1; });
  var drop = brandTokens(brand);
  var content = qTokens.filter(function (w) { return drop.indexOf(w) < 0; });
  var tokens = keyOf((cand.name || "") + " " + (cand.brand || "")).split(" ").filter(Boolean);
  var branded = mentionsBrand(brand, (cand.brand || "") + " " + (cand.name || ""));
  var pen = extraPenalty(query, cand);
  if (content.length) {
    var hit = content.filter(function (w) { return tokenHas(tokens, w); }).length;
    if (hit / content.length < 0.5) return -1;
    return hit * 10 + (branded ? 50 : 0) - pen;
  }
  if (brand && !branded) return -1;
  return (branded ? 40 : 5) - pen;
}
function usdaServing(food) {
  var unit = String(food.servingSizeUnit || "").toUpperCase();
  var size = +food.servingSize;
  if ((unit === "G" || unit === "GRM" || unit === "MG" || unit === "ML") && size >= 5 && size <= 800) {
    var grams = (unit === "MG") ? size / 1000 : size;
    if (grams >= 5) {
      var label = food.householdServingFullText ? String(food.householdServingFullText) : (round0(grams) + " g");
      return { grams: grams, label: label };
    }
  }
  var portions = food.foodPortions || [];
  var best = null;
  portions.forEach(function (p) {
    var g = +p.gramWeight;
    if (!(g >= 5 && g <= 800)) return;
    if (!best || Math.abs(g - 100) < Math.abs(+best.gramWeight - 100)) best = p;
  });
  if (!best) return null;
  var desc = best.portionDescription || [best.amount, best.modifier].filter(Boolean).join(" ");
  return { grams: +best.gramWeight, label: String(desc || (round0(best.gramWeight) + " g")).trim(), pieceCount: /piece/.test(String(best.modifier || "") + String(best.portionDescription || "")) ? (+best.amount || null) : null };
}
function candidateFromUsda(food, branded) {
  var per = per100FromUsdaFood(food);
  if (!per) return null;
  var serv = usdaServing(food);
  return {
    source: branded ? "usda-branded" : "usda",
    sourceLabel: branded ? "USDA Branded Foods" : "USDA FoodData Central",
    sourceId: String(food.fdcId),
    sourceUrl: "https://fdc.nal.usda.gov/food-details/" + food.fdcId + "/nutrients",
    name: food.description || "USDA food",
    brand: food.brandOwner || food.brandName || "",
    dataType: food.dataType || "",
    per100: per,
    grams: serv ? serv.grams : null,
    servingLabel: serv ? serv.label : "",
    pieceCount: serv && serv.pieceCount ? serv.pieceCount : null
  };
}
function offAmount(n, key) {
  if (!n || n[key] == null || n[key] === "" || isNaN(+n[key])) return null;
  return +n[key];
}
function offToUnit(n, key, unitWanted) {
  var v = offAmount(n, key);
  if (v == null) return null;
  var unit = String(n[key.replace("_100g", "_unit")] || "g").toLowerCase();
  if (unit === "iu") return null;
  var grams = v;
  if (unit === "mg") grams = v / 1000;
  else if (unit === "µg" || unit === "ug" || unit === "mcg") grams = v / 1e6;
  else if (unit !== "g") return null;
  if (unitWanted === "mg") return roundMicro("sodium", grams * 1000);
  if (unitWanted === "ug") return roundMicro("vita", grams * 1e6);
  return grams;
}
function per100FromOff(nutriments) {
  var n = nutriments || {};
  var kcal = offAmount(n, "energy-kcal_100g");
  if (kcal == null && offAmount(n, "energy_100g") != null && String(n.energy_unit || "").toLowerCase() === "kcal") kcal = offAmount(n, "energy_100g");
  if (kcal == null) return null;
  var micros = blankMicroMap();
  micros.fiber = offAmount(n, "fiber_100g");
  micros.sugar = offAmount(n, "sugars_100g");
  if (offAmount(n, "sodium_100g") != null) micros.sodium = offToUnit(n, "sodium_100g", "mg");
  else if (offAmount(n, "salt_100g") != null) {
    var salt = offToUnit(n, "salt_100g", "mg");
    micros.sodium = salt == null ? null : roundMicro("sodium", salt / 2.5);
  }
  micros.potassium = offToUnit(n, "potassium_100g", "mg");
  micros.calcium = offToUnit(n, "calcium_100g", "mg");
  micros.iron = offToUnit(n, "iron_100g", "mg");
  micros.magnesium = offToUnit(n, "magnesium_100g", "mg");
  micros.vita = offToUnit(n, "vitamin-a_100g", "ug");
  micros.vitc = offToUnit(n, "vitamin-c_100g", "mg");
  micros.vitd = offToUnit(n, "vitamin-d_100g", "ug");
  micros.b12 = offToUnit(n, "vitamin-b12_100g", "ug");
  return { kcal: kcal, p: offAmount(n, "proteins_100g"), c: offAmount(n, "carbohydrates_100g"), f: offAmount(n, "fat_100g"), micros: micros };
}
function offServing(product) {
  var qty = +product.serving_quantity;
  var text = String(product.serving_size || "");
  var fromText = /(\d+(?:\.\d+)?)\s*g\b/i.exec(text);
  var grams = null;
  if (qty >= 5 && qty <= 800) grams = qty;
  else if (fromText && +fromText[1] >= 5 && +fromText[1] <= 800) grams = +fromText[1];
  if (!grams) return { grams: 100, label: "100 g" };
  return { grams: grams, label: text || (round0(grams) + " g") };
}
function candidateFromOff(product) {
  var per = per100FromOff(product.nutriments);
  if (!per || !product.code) return null;
  var serv = offServing(product);
  return {
    source: "off",
    sourceLabel: "Open Food Facts",
    sourceId: String(product.code),
    sourceUrl: OFF_ORIGIN + "/product/" + product.code,
    name: product.product_name || "Open Food Facts item",
    brand: product.brands || "",
    per100: per,
    grams: serv.grams,
    servingLabel: serv.label,
    pieceCount: null
  };
}
function takeCandidates(query, brand, list) {
  var scored = [];
  list.forEach(function (c) {
    if (!c) return;
    var s = scoreCandidate(query, brand, c);
    if (s < 0) return;
    c.score = s;
    c.brandHit = mentionsBrand(brand, (c.brand || "") + " " + (c.name || ""));
    scored.push(c);
  });
  var anyBrand = scored.some(function (c) { return c.brandHit; });
  if (brand && anyBrand) scored = scored.filter(function (c) { return c.brandHit; });
  scored.sort(function (a, b) { return b.score - a.score; });
  var seen = {}, out = [];
  scored.forEach(function (c) {
    var id = c.source + ":" + c.sourceId;
    if (seen[id]) return;
    seen[id] = 1;
    if (out.length < 5) out.push(c);
  });
  return out;
}
function searchUsdaTyped(query, dataType, branded, apiKey, fetchImpl) {
  return httpJson(fdcSearchUrl(query, dataType, apiKey, 20), fetchImpl).then(function (j) {
    return ((j && j.foods) || []).map(function (f) { return candidateFromUsda(f, branded); }).filter(Boolean);
  }).catch(function (e) { return { error: e.message || "USDA lookup failed" }; });
}
function searchOff(query, fetchImpl) {
  var url = OFF_ORIGIN + "/cgi/search.pl?search_terms=" + encodeURIComponent(query) +
    "&search_simple=1&action=process&json=1&page_size=15&fields=" +
    encodeURIComponent("code,product_name,brands,nutriments,serving_size,serving_quantity");
  return httpJson(url, fetchImpl).then(function (j) {
    return ((j && j.products) || []).map(candidateFromOff).filter(Boolean);
  }).catch(function (e) { return { error: e.message || "Open Food Facts lookup failed" }; });
}
function searchWeb(query, apiKey, fetchImpl) {
  var brand = detectBrand(query);
  return Promise.all([
    searchUsdaTyped(query, "Foundation,SR Legacy,Survey (FNDDS)", false, apiKey, fetchImpl),
    searchUsdaTyped(query, "Branded", true, apiKey, fetchImpl),
    searchOff(query, fetchImpl)
  ]).then(function (parts) {
    var errors = [], all = [];
    parts.forEach(function (p) {
      if (p && p.error) errors.push(p.error);
      else if (Array.isArray(p)) all = all.concat(p);
    });
    return { brand: brand, candidates: takeCandidates(query, brand, all), error: all.length ? null : (errors[0] || null) };
  });
}
function scalePack(per, mult) {
  return {
    kcal: per.kcal == null ? null : round0(per.kcal * mult),
    p: per.p == null ? null : round1(per.p * mult),
    c: per.c == null ? null : round1(per.c * mult),
    f: per.f == null ? null : round1(per.f * mult),
    micros: scaleMicros(per.micros, mult)
  };
}
function webEntryFromCandidate(query, cand, verified) {
  var grams = cand.grams >= 5 ? cand.grams : 100;
  var pack = scalePack(cand.per100, grams / 100);
  return {
    key: keyOf(query),
    query: query,
    source: cand.source,
    sourceLabel: cand.sourceLabel,
    sourceId: String(cand.sourceId || ""),
    sourceUrl: cand.sourceUrl || "",
    name: cand.name,
    brand: cand.brand || "",
    servingLabel: cand.servingLabel || (round0(grams) + " g"),
    grams: round0(grams),
    pieceCount: cand.pieceCount || null,
    kcal: pack.kcal, p: pack.p, c: pack.c, f: pack.f,
    micros: pack.micros || blankMicroMap(),
    per100: cand.per100,
    lastVerified: verified
  };
}
function applyCached(item, entry) {
  var mult = item.qty || 1;
  var basis = "serving";
  var u = item.unit ? UNITS[item.unit] : null;
  var pack;
  if (u && u.g && entry.per100) {
    basis = "per100";
    mult = (item.qty * u.g) / 100;
    pack = scalePack(entry.per100, mult);
  } else if (u && u.k === "piece" && entry.pieceCount && entry.per100 && entry.grams) {
    basis = "per100";
    mult = (entry.grams * (item.qty / entry.pieceCount)) / 100;
    pack = scalePack(entry.per100, mult);
  } else if (entry.per100 && entry.grams) {
    basis = "serving";
    pack = scalePack(entry.per100, (entry.grams / 100) * mult);
  } else {
    pack = {
      kcal: entry.kcal == null ? null : round0(entry.kcal * mult),
      p: entry.p == null ? null : round1(entry.p * mult),
      c: entry.c == null ? null : round1(entry.c * mult),
      f: entry.f == null ? null : round1(entry.f * mult),
      micros: scaleMicros(entry.micros, mult)
    };
  }
  item.source = "web";
  item.webKey = entry.key;
  item.webSource = entry.source;
  item.sourceLabel = entry.sourceLabel;
  item.sourceId = entry.sourceId;
  item.sourceUrl = entry.sourceUrl || "";
  item.food = entry.name;
  item.brand = entry.brand || "";
  item.matched = true;
  item.lastVerified = entry.lastVerified;
  item.servingLabel = entry.servingLabel || "";
  item.webBasis = basis;
  item.webMult = mult;
  item.note = "Verified " + entry.lastVerified + " via " + entry.sourceLabel;
  item.kcal = pack.kcal; item.p = pack.p; item.c = pack.c; item.f = pack.f;
  item.micros = pack.micros || blankMicroMap();
  if (entry.grams) item.grams = round0(basis === "per100" ? mult * 100 : entry.grams * (item.qty || 1));
  return item;
}
function refineUsdaCandidate(cand, apiKey, fetchImpl) {
  if (!cand || cand.source === "off" || cand.source === "manual") return Promise.resolve(cand);
  if (cand.grams >= 5) return Promise.resolve(cand);
  return httpJson(fdcFoodUrl(cand.sourceId, apiKey), fetchImpl).then(function (food) {
    var per = per100FromUsdaFood(food) || cand.per100;
    var serv = usdaServing(food);
    cand.per100 = per;
    if (serv) { cand.grams = serv.grams; cand.servingLabel = serv.label; cand.pieceCount = serv.pieceCount || null; }
    else { cand.grams = 100; cand.servingLabel = "100 g"; }
    if (!cand.brand && (food.brandOwner || food.brandName)) cand.brand = food.brandOwner || food.brandName;
    return cand;
  }).catch(function () {
    cand.grams = cand.grams || 100;
    cand.servingLabel = cand.servingLabel || "100 g";
    return cand;
  });
}
function refetchWeb(entry, apiKey, fetchImpl) {
  if (!entry || entry.source === "manual" || !entry.sourceId) return Promise.resolve(null);
  if (entry.source === "off") {
    var url = OFF_ORIGIN + "/api/v2/product/" + encodeURIComponent(entry.sourceId) + ".json?fields=" +
      encodeURIComponent("code,product_name,brands,nutriments,serving_size,serving_quantity");
    return httpJson(url, fetchImpl).then(function (j) {
      var product = j && j.product;
      if (!product) return null;
      var per = per100FromOff(product.nutriments);
      if (!per) return null;
      var cand = { source: "off", sourceLabel: "Open Food Facts", sourceId: String(product.code), sourceUrl: entry.sourceUrl,
        name: product.product_name || entry.name, brand: product.brands || entry.brand || "", per100: per,
        grams: entry.grams || offServing(product).grams, servingLabel: entry.servingLabel || offServing(product).label, pieceCount: entry.pieceCount || null };
      return cand;
    });
  }
  return httpJson(fdcFoodUrl(entry.sourceId, apiKey), fetchImpl).then(function (food) {
    var per = per100FromUsdaFood(food);
    if (!per) return null;
    return {
      source: entry.source, sourceLabel: entry.sourceLabel, sourceId: String(food.fdcId || entry.sourceId),
      sourceUrl: entry.sourceUrl, name: food.description || entry.name, brand: food.brandOwner || food.brandName || entry.brand || "",
      per100: per, grams: entry.grams || (usdaServing(food) ? usdaServing(food).grams : 100),
      servingLabel: entry.servingLabel || "", pieceCount: entry.pieceCount || null
    };
  });
}

var api = { normalize: normalize, singular: singular, keyOf: keyOf, buildIndex: buildIndex, splitPhrase: splitPhrase,
  parseQty: parseQty, matchFood: matchFood, matchRecipe: matchRecipe, gramsFor: gramsFor, resolveSegment: resolveSegment,
  parsePhrase: parsePhrase, totals: totals, usdaSearch: usdaSearch, applyUsda: applyUsda, round1: round1, UNITS: UNITS,
  MICRO_KEYS: MICRO_KEYS, scaleMicros: scaleMicros, sumMicros: sumMicros, collectMicros: collectMicros, divideMicros: divideMicros,
  detectBrand: detectBrand, localMissesBrand: localMissesBrand, searchWeb: searchWeb, refineUsdaCandidate: refineUsdaCandidate,
  webEntryFromCandidate: webEntryFromCandidate, applyCached: applyCached, refetchWeb: refetchWeb, mentionsBrand: mentionsBrand };
root.CadenceParser = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
