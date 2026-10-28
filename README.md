# Cadence v1

Cadence is a private food, macro and weight tracker. It's plain HTML, CSS and JavaScript, with no build step. With sync off, there is no account and the log stays in this browser. Sync is optional and loads Firebase only after you turn it on.

## Open it

- **Quickest:** double-click `index.html`. Logging, recipes, weight, goals and export/import all work from `file://`.
- **Recommended (needed for the mic, offline install and the service worker):** serve the folder locally:
  ```
  cd cadence
  python3 -m http.server 8000
  ```
  Then open <http://localhost:8000>.

## Tabs

- **Today:** calorie ring and protein/carb/fat bars against your goals, that day's entries, and your latest weight with a mini trend. Arrows and a calendar move to another day. Trend charts for calories and macros sit at the bottom. See **Days and trends**.
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

## Days and trends

Today opens on the current day. The header has back and forward arrows, the date, and a **Today** button when you are looking at another day. Forward stops at today. Back stops 364 days earlier, so the reachable span is 365 days including today. Tap the date for a month calendar. Days that already have food get a dot. Days outside that 365-day window are disabled, and the date field in the calendar has the same minimum and maximum. Swipe left or right on the page to move a day. The ring, macro and nutrient bars, and the entry list (with Edit and Delete) all follow the day you picked.

Logging while you are looking at a past day uses that date and the current time of day. The chosen day is not saved: reopening Cadence, or switching profiles, returns to today. A locked profile still stays behind the PIN. The calendar only shows the person who is unlocked.

The Food list uses the same 365-day window (the older 60-day cap is gone). It draws the newest two weeks first. **Show older days**, or scrolling that button into view, loads the next month of days so a full year does not render at once.

Trend charts sit at the bottom of Today, not in a fifth tab. Four tabs already fill a phone. Each chart is calories, protein, carbs, or fat for this profile. The data window is the past 365 days. Chips pick **30d**, **90d** (the default, which stays readable on a phone), or **1y**. Axis labels are months, not every day. The dashed line is that profile's goal. Days with no food are left out of the line, not drawn as zero, and a gap in the line means the logged days were not next to each other. Tap or hover a point to read that day. The charts redraw when you switch profiles, change the range, or log food.

## Profiles

The header shows who is logging: a small avatar and name. Tap it to switch, add, rename, or remove a profile. Joseph, Cindy, and Leo are already there. Joseph is the default, and the last person you opened is remembered in this browser.

Food logs, daily goals (calories, protein, carbs, fat, and goal weight), and weigh-ins belong to the active profile. Today, Food, Weight, and Goals show only that person's numbers. Recipes and saved web lookups are a shared household library. Logging a serving writes into the active profile's food log. The USDA API key and the online-lookup switch stay global.

An older `cadence.v1` save is copied into Joseph's profile the first time a profiles build loads. Nothing is dropped. The `cadence.v1` key is left in place as a backup. The working copy is now `cadence.v5`: `{ version, activeProfileId, profiles: [{ id, name, color, age, sex, foods, weights, goals, lock, updatedAt, tombstones }], recipes, webFoods, profileTombstones, recipeTombstones, webTombstones, settings }`. Older `cadence.v4`, `cadence.v3`, `cadence.v2`, and `cadence.v1` saves are migrated forward and those keys are kept. Food entries gain a `micros` object when they are logged; older entries are left as they were. Each entry also keeps `updatedAt` so two devices can merge one entry at a time.

Removing a profile asks first. Removing Joseph names the entries that would be deleted.

Until sync is turned on, data stays **on this device**. Cindy's log on one phone is not on another phone. Use Export / Import to move a copy, or turn on Sync. A full backup includes every profile. An older v1 file imports into the profile that is open. Export does not include the sync passphrase or the device's sync key.

## Profile PIN

Cindy starts locked. Joseph and Leo do not. Any profile can be locked from the profile switcher with **Lock with PIN**.

The first time someone opens Cindy, Cadence asks for a 4–6 digit PIN, entered twice, then shows a one-time 8-character recovery code. Write that code down. Only a salted PBKDF2 hash is kept (the PIN wraps a random key; the PIN itself is not stored). Her food log, goals, and weights are encrypted at rest with AES-GCM. The screen does not show her entries until the PIN is accepted. A wrong PIN shows an error. After five wrong tries the pad waits 30 seconds.

The lock closes when you switch to someone else, when the page is reloaded or reopened, and after about five minutes idle or in the background. If Cindy was the last person open, the next launch starts on Joseph and asks for her PIN to go back.

- **Change PIN:** open her profile, go to **Goals**, and under **Profile lock** enter the current PIN, then the new one twice.
- **Forgot PIN:** on the PIN pad choose **Forgot PIN** and enter the recovery code. Her log is kept and you set a new PIN. Without the code, **Reset profile** erases that profile's food, weight, and goals after you type the profile name. There is no control that turns the lock off and leaves her log visible without the PIN or the recovery code.
- **Turn off the lock or delete her profile:** both ask for her PIN.
- **Export:** a backup includes a locked profile only after that PIN is entered. Otherwise Cadence leaves that profile out and says so. What is included is ciphertext, the same shape as in this browser.

This is a casual privacy lock for a shared phone, not real security. The PIN is short, and anyone who can open developer tools or copy this browser's `localStorage` can attack it offline. Encryption stops a casual glance at the saved JSON. It does not stop someone with the device and enough time.

## Micronutrients

Today, and each day in the Food log, has a **Macros / Nutrients** switch. Nutrients shows fiber, total sugar, sodium, potassium, calcium, iron, magnesium, and vitamins A, C, D, and B12 for that day, with a bar for the percent of the target.

Targets follow NIH Office of Dietary Supplements and National Academies DRIs (RDA or Adequate Intake) and depend on the age and sex set on that profile's Goals screen. Joseph starts as an adult man and Cindy as an adult woman. Leo's age is not set; the app asks you to set it and uses adult-male targets until you do. Sodium uses the chronic disease risk reduction intake as an upper target (2,300 mg from age 14, lower for children) and turns the bar amber when you go over. Sugar uses the FDA 50 g Daily Value for added sugar, but the food value is **total** sugar.

Built-in foods carry USDA FoodData Central values (SR Legacy April 2018, Foundation Foods April 2026, or FNDDS 2021–2023), scaled to the listed serving. Each food records its `fdcId`. A `0` was reported as zero. `null` means that nutrient was not in the matched entry. Two foods have no defensible composed entry, so every nutrient is null: dressed Caesar salad, and balsamic vinaigrette. Online USDA matches store the same nutrients (numbers 291, 269, 307, 306, 301, 303, 304, 320, 401, 328, 418).

Recipes sum those values into the batch and into each serving. A day that still has an entry from before this update (no `micros` field) says **Incomplete — some entries logged before nutrient tracking**. Those entries are left out of the totals. A nutrient that is missing on only some foods is marked incomplete instead of being shown as zero.

The working save is `cadence.v4`. Previous `cadence.v3` and `cadence.v2` keys are kept. Export includes `micros` and still accepts older backups.

## How nutrition lookup works

1. The parser splits phrases on commas, "and", "with", "plus" and similar words. It keeps dishes such as "mac and cheese", "PB&J" and "coffee with milk" together.
   - It understands numbers and number words, "a/an", "half", fractions ("1 1/2"), "a dozen", and units (g, oz, lb, cup, tbsp, tsp, slice, scoop, serving, bowl…).
2. It then looks in the built-in list of about 240 common foods (`js/foods.js`). Calories and macros are the previous serving values, except a few that clearly disagreed with the matched USDA entry. Micronutrients are the matched FoodData Central values for that serving.
3. If there's no good match and **Online lookup** is on, Cadence asks public sources that the browser can call directly. See **Web lookup** below.
   - A plain food (no restaurant or brand in the name) still goes to USDA Foundation, SR Legacy, and FNDDS first, the same as before.
   - It uses the shared `DEMO_KEY`. That key is rate-limited per IP address (USDA says roughly 30 requests an hour and 50 a day), so heavy use will hit "rate limit reached".
   - A free personal key fixes this: get one at <https://fdc.nal.usda.gov/api-key-signup> and paste it in **Goals › Food lookup**.
   - When a USDA match is listed by cups or spoons, the weight is estimated (about 240 g a cup) and the item is labelled "estimate", so check it.
4. Anything still unmatched can be typed from the nutrition label. That label is saved in the shared lookup cache.

## Web lookup

The built-in list and the generic USDA search do not cover every packaged food. Generic USDA (Foundation, SR Legacy, FNDDS) already includes some chain items, such as McDonald's Chicken McNuggets. It does **not** search USDA Branded Foods. Cadence adds that, plus Open Food Facts, when a name is still unknown or when the phrase names a restaurant or brand.

Sources, checked from a browser origin:

- **USDA FoodData Central**, including `dataType=Branded`. CORS allows it (`access-control-allow-origin: *`). Branded foods are mostly grocery products with a label serving. Restaurant coverage is uneven: McDonald's menu items are often in SR Legacy, while Chipotle the restaurant is not. A search for Chipotle returns other companies' foods that use the word, such as a grocery chicken bowl.
- **Open Food Facts** search at `world.openfoodfacts.net` (the `.org` search was returning 503, and `search.openfoodfacts.org` does not send `Access-Control-Allow-Origin`, so the browser cannot use it). No key. It has brands and some restaurant items, with nutrients per 100 g. Micros that the product page does not list stay unknown. Vitamin A is omitted when the published unit is IU, because that is not µg RAE.
- **Nutritionix** is not used. As of October 2026 their developer site says the public free trial for developers, students, and hobbyists is gone. A free business trial (up to 2 monthly active users) exists only by asking their sales team. Their pricing page lists paid plans from $499 a month, billed annually. Cadence does not add App ID or key fields for it.

When the phrase names a brand, Cadence prefers matches whose name or brand includes it and shows the top few before anything is saved. Each row shows the source, the item name, and the calories for that serving. **None of these — enter the label** saves a manual entry into the same cache. A `0` you type is zero. A box you leave empty is unknown.

Saved lookups live in the household `webFoods` list, keyed by the normalized name, next to recipes. Each one stores the source, the source id and URL, the serving, calories, macros, micros, and `lastVerified`. An entry that came from that cache says **Verified 2026-10-28 via USDA FoodData Central** (the date and the source change).

Logging the same name again uses the cache and does not call the network, until `lastVerified` is more than 6 months old. Then Cadence logs the saved values immediately and re-fetches that source in the background. A successful refresh updates the cache and that new entry. If the refresh fails or the phone is offline, the old numbers stay and the entry gets a small **couldn't refresh** note. **Refresh** on a web-sourced row (the day card or the edit sheet) forces a lookup, shows the current numbers next to the new ones, and updates that entry plus the cache only if you accept. Other days are left as they were.

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

- Everything is saved in your browser's `localStorage` under the key `cadence.v4` (see Profiles, Micronutrients, and Web lookup). Previous `cadence.v3`, `cadence.v2`, and `cadence.v1` values are kept as backups and are not deleted.
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

Data saved in the installed app lives on that phone until Sync is turned on. Use Export/Import to move a copy by hand.

### Updating
After you change any file, bump `VERSION` in `sw.js` so installed copies download the new version.

## Sync across devices

Sync is off by default. The app behaves as it does today until Joseph turns it on from **Goals → Sync**. Firebase is the free Spark plan: Firestore plus Google sign-in. A free Supabase project pauses after a week of inactivity, so Cadence does not use Supabase. The Firebase SDK is loaded from Google's CDN only after sync is turned on. There is still no build step.

The server stores ciphertext only. The browser encrypts every profile, the recipe list, and the saved web lookups with AES-GCM before upload. The key is a random key wrapped by PBKDF2-SHA-256 (600,000 iterations) derived from a household sync passphrase. The passphrase is never uploaded. A verifier stored next to the wrapped key rejects a wrong passphrase. TLS covers the connection, and Google encrypts Firestore at rest as well. Cindy's profile is sealed again with her PIN key, so signing into the household Google account does not open her log.

Cadence syncs on launch, about a second after each change, and when the browser fires `online`. Offline edits stay on the device and count as pending. Entries merge by stable id and `updatedAt`: the newer write wins for that entry, and a delete is a tombstone so it is not put back by the other device. Turning sync on for the first time on a second device merges the two logs. It does not replace one with the other. The same day can be edited on the phone and the computer without one log erasing the other.

The Sync card shows sign-in, passphrase setup, the last synced time, the pending count, errors, **Sync now**, and **Turn off sync and delete cloud copy** (it asks first). Sign out leaves the cloud copy in place. Turning sync off deletes that account's Firestore documents and forgets the key on this device. The local log stays.

If the passphrase is lost, a new device cannot decrypt the cloud copy. The log already on a device that unlocked sync is unaffected. The service worker never caches Firebase or Google API calls.

### What Joseph has to click

1. Open [console.firebase.google.com](https://console.firebase.google.com/) and sign in with the Google account that will own the household.
2. Click **Create a project** (it may say **Add project**). Name it `Cadence`. Click **Continue**.
3. Turn **off** Google Analytics. It is not used. Click **Create project**, wait, then **Continue**.
4. Stay on the free **Spark** plan. Do not upgrade to Blaze.
5. On the project overview, click the **Web** icon (`</>`).
6. App nickname: `Cadence`. Leave Firebase Hosting unchecked. Click **Register app**.
7. Copy the `firebaseConfig` values. You can skip the SDK snippet pages with **Continue** / **Continue to console**. Cadence loads the SDK itself.
8. In this repo, open `js/sync-config.js` and replace every `PASTE_...` value with `apiKey`, `authDomain`, `projectId`, `appId`, and, if the console showed them, `messagingSenderId` and `storageBucket`. Do not put the passphrase in that file.
9. In the left nav, open **Build → Authentication** and click **Get started**.
10. Open the **Sign-in method** tab, click **Google**, switch **Enable** on, choose a support email, and click **Save**.
11. Open **Authentication → Settings → Authorized domains**. `localhost` is already there. Click **Add domain**, type `jcollis33-creator.github.io` with no `https://` and no path, and save.
12. In the left nav, open **Build → Firestore Database** and click **Create database**.
13. Start in **production mode** so the database is closed until the rules below are deployed. Pick a region close to home (it cannot be changed later) and click **Enable**.
14. From the Cadence folder on a computer, deploy `firestore.rules` (this repo's `firebase.json` already points at that file):
    ```
    npx firebase-tools@latest login
    npx firebase-tools@latest use --add
    npx firebase-tools@latest deploy --only firestore:rules
    ```
    Choose the Cadence project when asked. The rules allow a signed-in user to read and write only `users/{their uid}/...`. Nothing is publicly readable.
15. Commit `js/sync-config.js` and push to `main` so GitHub Pages serves the config. The web apiKey is not a secret; the rules and Google sign-in are what close the data. The passphrase and the food log are not in that file.
16. On each device, open Cadence → **Goals** → **Sync** → **Turn on sync** → **Sign in with Google**. On the first device, set the household passphrase and confirm it. On the next device, type the same passphrase. Cadence warns that losing it makes the cloud copy unreadable.

Cloud documents:

- `users/{uid}/profiles/{profileId}` — one encrypted document per profile. A removed profile is left as an encrypted tombstone.
- `users/{uid}/shared/recipes` — encrypted recipe list and recipe tombstones.
- `users/{uid}/shared/webFoods` — encrypted saved lookups and their tombstones.
- `users/{uid}/shared/key` — PBKDF2 salt, iteration count, wrapped key, and verifier. Not the passphrase.

## Files

```
index.html             app shell (tabs, forms, dialog)
css/app.css            styles (paper #F3F1EC, ink #1C1B19, forest #1F5C45)
js/foods.js            built-in food list (~240 foods)
js/parser.js           phrase parser, food/recipe matching, USDA lookup
js/lock.js             PIN key wrapping (PBKDF2) and AES-GCM sealing
js/sync-config.js      Firebase web config placeholders (no passphrase, no logs)
js/sync.js             passphrase key, entry merge, offline queue, Firebase loader
js/app.js              UI, profiles, storage, charts, recipes, export/import
firestore.rules        Firestore rules: only the signed-in uid can read or write
firebase.json          points the Firebase CLI at firestore.rules
manifest.webmanifest   PWA manifest
sw.js                  service worker (offline app shell; does not cache Firebase)
icons/                 app icons (192, 512, maskable 512, apple-touch 180, favicon)
tools/make_icons.py    regenerates the icons (Pillow)
netlify.toml, .nojekyll  hosting helpers
screenshots/           phone-width screenshots taken with demo data
```
