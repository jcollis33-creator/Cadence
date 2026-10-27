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

## Profiles

The header shows who is logging: a small avatar and name. Tap it to switch, add, rename, or remove a profile. Joseph, Cindy, and Leo are already there. Joseph is the default, and the last person you opened is remembered in this browser.

Food logs, daily goals (calories, protein, carbs, fat, and goal weight), and weigh-ins belong to the active profile. Today, Food, Weight, and Goals show only that person's numbers. Recipes are a shared household library. Logging a serving writes into the active profile's food log. The USDA API key and the online-lookup switch stay global.

An older `cadence.v1` save is copied into Joseph's profile the first time this version loads. Nothing is dropped. The `cadence.v1` key is left in place as a backup. The working copy is `cadence.v2`: `{ version, activeProfileId, profiles: [{ id, name, color, foods, weights, goals, lock }], recipes, settings }`.

Removing a profile asks first. Removing Joseph names the entries that would be deleted.

Data is still **per device**. Cindy's log on Joseph's phone is not on Cindy's phone. Use Export / Import to move a copy. A full backup includes every profile. An older v1 file imports into the profile that is open.

## Profile PIN

Cindy starts locked. Joseph and Leo do not. Any profile can be locked from the profile switcher with **Lock with PIN**.

The first time someone opens Cindy, Cadence asks for a 4–6 digit PIN, entered twice, then shows a one-time 8-character recovery code. Write that code down. Only a salted PBKDF2 hash is kept (the PIN wraps a random key; the PIN itself is not stored). Her food log, goals, and weights are encrypted at rest with AES-GCM. The screen does not show her entries until the PIN is accepted. A wrong PIN shows an error. After five wrong tries the pad waits 30 seconds.

The lock closes when you switch to someone else, when the page is reloaded or reopened, and after about five minutes idle or in the background. If Cindy was the last person open, the next launch starts on Joseph and asks for her PIN to go back.

- **Change PIN:** open her profile, go to **Goals**, and under **Profile lock** enter the current PIN, then the new one twice.
- **Forgot PIN:** on the PIN pad choose **Forgot PIN** and enter the recovery code. Her log is kept and you set a new PIN. Without the code, **Reset profile** erases that profile's food, weight, and goals after you type the profile name. There is no control that turns the lock off and leaves her log visible without the PIN or the recovery code.
- **Turn off the lock or delete her profile:** both ask for her PIN.
- **Export:** a backup includes a locked profile only after that PIN is entered. Otherwise Cadence leaves that profile out and says so. What is included is ciphertext, the same shape as in this browser.

This is a casual privacy lock for a shared phone, not real security. The PIN is short, and anyone who can open developer tools or copy this browser's `localStorage` can attack it offline. Encryption stops a casual glance at the saved JSON. It does not stop someone with the device and enough time.

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

- Everything is saved in your browser's `localStorage` under the key `cadence.v2` (see Profiles). A previous `cadence.v1` value is kept as a backup and is not deleted.
- Data is **per device and per browser**. Your phone and laptop don't sync. Cindy's log on Joseph's phone is not on Cindy's phone. Clearing site data or private browsing erases it, and the file:// copy and the https:// copy of Cadence don't share data.
- Use **Goals › Export JSON** to make a backup or move devices, then **Import JSON** on the other device. A v2 import replaces profiles (profiles left out of a partial export are kept if they are still on this device). A v1 import replaces the open profile's food, weight, and goals, plus the shared recipes and settings.

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
js/lock.js             PIN key wrapping (PBKDF2) and AES-GCM sealing
js/app.js              UI, profiles, storage, charts, recipes, export/import
manifest.webmanifest   PWA manifest
sw.js                  service worker (offline app shell cache)
icons/                 app icons (192, 512, maskable 512, apple-touch 180, favicon)
tools/make_icons.py    regenerates the icons (Pillow)
netlify.toml, .nojekyll  hosting helpers
screenshots/           phone-width screenshots taken with demo data
```
