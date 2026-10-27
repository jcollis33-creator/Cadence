# Cadence v1

Cadence is a private food, macro and weight tracker. It's plain HTML, CSS and JavaScript, with no build step, no CDN and no account. All your data stays in your browser.

## Open it

- **Quickest:** double-click `index.html`. Logging, recipes, weight, goals and export/import all work from `file://`.
- **Recommended (needed for the mic, offline install and the service worker):** serve the folder locally:
  ```
  cd cadence
  python3 -m http.server 8000
  ```
  Then open <http://localhost:8000>.

## Tabs

- **Today:** calorie ring and protein/carb/fat bars against your goals, today's entries, and your latest weight with a mini trend.
- **Food › Log:** type or speak what you ate, e.g. "two eggs and toast" or "8 oz salmon, 1 cup rice and broccoli". A live preview shows how the text was read. Then tap **Log it**.
  - Entries keep their date and time, and the time can be changed before logging.
  - Tap **Edit** on any entry to change the time, re-read the text, or change any item's macros by hand. **Delete** removes the entry.
  - Items Cadence can't match are logged at 0 and the editor opens so you can type in the macros.
- **Food › Recipes:** add a name and the number of servings, then list ingredients one per line (typed or spoken). Tap **Look up macros**.
  - You'll see each ingredient's macros, which you can edit, plus the recipe total and per-serving numbers.
  - Recipes can be logged from the "Log a saved recipe" picker at any number of servings. Each one logs as a single entry, e.g. "Chili (1.5 servings)".
  - You can also type "a bowl of chili" or "1 serving chili". Saved recipe names are checked before the food list.
- **Weight:** pick a date (it defaults to today) and enter a weight in lb. Adding a weight for a date that already has one replaces it.
  - The line chart shows a dashed line at your goal weight, and there are stats for latest weight, change, and pounds to goal.
- **Goals:** daily calories and P/C/F (defaults 2200 / 180 / 220 / 70) and goal weight (default 180 lb). Also here: the online lookup toggle, your USDA API key, and Export / Import / Clear.

## How nutrition lookup works

1. The parser splits phrases on commas, "and", "with", "plus" and similar words. It keeps dishes such as "mac and cheese", "PB&J" and "coffee with milk" together.
   - It understands numbers and number words, "a/an", "half", fractions ("1 1/2"), "a dozen", and units (g, oz, lb, cup, tbsp, tsp, slice, scoop, serving, bowl…).
2. It then looks in the built-in list of about 240 common foods (`js/foods.js`). Values are approximate and based on USDA FoodData Central typical servings.
3. If there's no good match and **Online lookup** is on, Cadence asks the **USDA FoodData Central** search API.
   - It uses the shared `DEMO_KEY`. That key is rate-limited per IP address (USDA says roughly 30 requests an hour and 50 a day), so heavy use will hit "rate limit reached".
   - A free personal key fixes this: get one at <https://fdc.nal.usda.gov/api-key-signup> and paste it in **Goals › Food lookup**.
   - When a USDA match is listed by cups or spoons, the weight is estimated (about 240 g a cup) and the item is labelled "estimate", so check it.
4. Anything still unmatched gets macros typed in by hand. Low-confidence matches are labelled "best guess — check".

All numbers are estimates. Brands and recipes vary.

## Voice input: what actually works

The mic button uses the browser's built-in Web Speech API. It only works on **https://** or **http://localhost**.

| Browser | Mic button |
|---|---|
| Chrome (desktop, Android) | Works. Speech goes to Google's servers, so you need internet. |
| Safari (Mac; iPhone/iPad iOS 14.5+) | Works in the Safari browser tab. Siri / Dictation must be turned on (Settings › General › Keyboard › Enable Dictation). |
| Cadence added to the iPhone Home Screen | **Does not work.** Apple doesn't offer speech recognition to Home Screen web apps. |
| Firefox, Edge | Not supported or unreliable. |

**Fallback that works everywhere:** tap the text box and use the **mic key on your phone's keyboard** (iOS Dictation or Gboard voice typing). Then tap **Log it**.

When the mic button does work, Cadence logs the item as soon as you stop speaking. You can then fix it with **Edit**.

## Your data

- Everything is saved in your browser's `localStorage` under the key `cadence.v1`. The format is `{ foods, weights, goals, settings, recipes }`.
- Data is **per device and per browser**. Your phone and laptop don't sync. Clearing site data or private browsing erases it, and the file:// copy and the https:// copy of Cadence don't share data.
- Use **Goals › Export JSON** to make a backup or move devices, then **Import JSON** on the other device. Importing replaces what's there.

## Put it on your phone

Cadence is an installable web app (PWA). It has a manifest, icons, and a service worker that caches the app so it opens offline. For that it has to be served over **https**.

### 1. Host it (free)
The folder is ready to deploy as-is. Paths are relative, so it works at a domain root or in a subfolder, and there's a `netlify.toml` and `.nojekyll`. Any one of these works:

- **Netlify:** create a personal access token (User settings › Applications), then:
  ```
  NETLIFY_AUTH_TOKEN=<token> npx netlify-cli deploy --prod --dir . --site <site-id-or-name>
  ```
  If you don't have a site yet, run `npx netlify-cli sites:create --name cadence-<you>` first.
  Netlify Drop (dragging the folder onto app.netlify.com/drop) also works. Claim the site, otherwise anonymous drops expire.
- **GitHub Pages:** push this folder to a repo, then go to Settings › Pages › Deploy from branch (`main`, `/root`). The site will be at `https://<user>.github.io/<repo>/`.
- **Cloudflare Pages:** `npx wrangler pages deploy . --project-name cadence`.

### 2. Add to Home Screen
- **iPhone (Safari):** open the https URL › **Share** › **Add to Home Screen** › Add.
  For the voice button, use Cadence in a normal Safari tab, or use keyboard dictation in the Home Screen app.
- **Android (Chrome):** open the URL › **⋮ menu** › **Install app** (or **Add to Home screen**).

Data saved in the installed app lives on that phone. Use Export/Import to move it.

### Updating
After you change any file, bump `VERSION` in `sw.js` so installed copies download the new version.

## Files

```
index.html             app shell (tabs, forms, dialog)
css/app.css            styles (paper #F3F1EC, ink #1C1B19, forest #1F5C45)
js/foods.js            built-in food list (~240 foods)
js/parser.js           phrase parser, food/recipe matching, USDA lookup
js/app.js              UI, storage, charts, recipes, export/import
manifest.webmanifest   PWA manifest
sw.js                  service worker (offline app shell cache)
icons/                 app icons (192, 512, maskable 512, apple-touch 180, favicon)
tools/make_icons.py    regenerates the icons (Pillow)
netlify.toml, .nojekyll  hosting helpers
screenshots/           phone-width screenshots taken with demo data
```
