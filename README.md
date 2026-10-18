# Pantry & Meals

A tablet app for tracking a pantry, a grocery list and a meal plan. It works fully offline, and all data stays on the device.

This repository holds **only the app's code**. Your personal data is never uploaded here. You load it on the tablet the first time you open the app.

---

## Part 1. Put the app on GitHub Pages (one time, about 10 minutes)

GitHub Pages hosts the app for free at an `https://` address. A PWA needs `https://` before Android will install it.

### 1. Make a GitHub account
Go to <https://github.com/signup> and create a free account. Your username will be part of the app's address.

### 2. Create a repository
1. Sign in and click the **+** at the top right, then **New repository**.
2. **Repository name:** `pantry-app`
3. Choose **Public**. Free GitHub Pages needs a public repository, which is why your data file isn't stored here.
4. Leave "Add a README file" **unticked**. This folder already has one.
5. Click **Create repository**.

### 3. Upload the app files
1. On the new, empty repository page, click the link **uploading an existing file**.
2. Open the `pantry-app` folder on your computer. Select **everything inside it** and drag it into the browser window:
   `index.html`, `manifest.webmanifest`, `sw.js`, `README.md`, `.gitignore`, and the folders `css`, `js` and `icons`.
   Drag the *contents*, not the `pantry-app` folder itself. `index.html` has to end up at the top level.
3. Wait until every file shows in the list.
4. Type a short message under "Commit changes", such as `First upload`, and click **Commit changes**.

> **Never upload `pantry-data.json` or any backup file.** The `.gitignore` file guards against this if you ever use Git, but the web uploader uploads whatever you drag in, so keep an eye on it.

### 4. Turn on GitHub Pages
1. In the repository, click **Settings** (the gear tab), then **Pages** in the left menu.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Under **Branch**, choose **main** and **/ (root)**, then click **Save**.
4. Wait 1 to 2 minutes, then refresh the page. A box at the top shows your address:
   `https://YOUR-USERNAME.github.io/pantry-app/`

Open that address on your computer to check it. You should see the "Import my data file" screen.

---

## Part 2. Install it on the tablet

### 1. Get your data file onto the tablet
Copy `pantry-data.json` to the tablet's **Downloads** folder. You can email it to yourself, upload it to Google Drive and download it on the tablet, or use Quick Share.

### 2. Open the address and install
**In Chrome:**
1. Open `https://YOUR-USERNAME.github.io/pantry-app/`
2. Tap the **⋮** menu, then **Add to home screen**, then **Install**. (If Chrome shows an **Install app** banner, you can tap that instead.)

**In Samsung Internet:**
1. Open the same address.
2. Tap the install icon in the address bar (a down arrow over a phone). Or tap the **≡** menu, then **Add page to**, then **Home screen**.

### 3. First launch
1. Open **Pantry** from the home screen. It opens full screen, with no browser bars.
2. Tap **Import my data file** and pick `pantry-data.json` from Downloads.
3. You'll see "Loaded 218 items and 7 days." That's it.

### 4. Check that it works offline
Turn on airplane mode, close the app, and open it again. Everything should still be there.

---

## Part 3. Everyday use

| Screen | What it's for |
|---|---|
| **Today** | Tick meals as you eat them and the four bars fill up. Tap a meal to edit it. Water: +8 oz per tap. Rate energy and focus 1 to 5 (tap the same number again to clear it). |
| **Quests** | Your fitness campaign. Tap **Done** on a quest to earn XP (and the same amount of gold). **Undo** shows for a few seconds after each tap. The 5K boss track sits top right, and **Travel week** moves hotel and Hinge Health quests to the top. Today shows the next quest too, so it's one tap from the home screen. |
| **Week** | Seven day cards with totals. **Ideal day** fills a day from your template. **Copy to…** and **Copy from…** copy a whole day. Use the arrows to move a week at a time. |
| **Pantry** | Tap an item to set its fill (Full, Most, Half, Low, Out, or the slider). The cart button adds it to groceries. **Add item** is at the top. |
| **Groceries** | Type to add. Tick things as you shop, then tap **Done shopping** to clear them and mark the matching pantry items Full. **Suggested** lists items at 25% or less. |
| **Recipes** | Recipe cards and the weekly prep checklist. **New week** unticks all the prep tasks. |
| **Settings** | Targets, diet rules, and backup. |

**Numbers that show "—"** are unknown, not zero. A total like "42+" means some of the rows you ticked don't have that number yet. Edit a meal to fill it in.

---

## Part 4. Backups, and updating your data with Claude

Your data lives only on the tablet. If you clear Chrome's data or uninstall the app, it's gone. So:

- **Back up:** Settings → **Export to Downloads**. This saves `pantry-data-YYYY-MM-DD.json`. Or use **Share backup…** to send it straight to Google Drive or email.
- **Restore:** Settings → **Import a file…** and pick a backup. This replaces everything on the tablet.
- **Have Claude update your data:** export, give Claude the file, and ask for changes (for example, "add the groceries I bought" or "plan next week"). Then import the file Claude gives back. The export uses the same layout as the original `pantry-data.json`, plus your ticks, water, scores and prep progress.

---

## Part 5. Changing the app later

1. Edit the file(s) on your computer.
2. Open `sw.js` and change `CACHE_NAME` from `pantry-meals-v1` to `pantry-meals-v2` (then v3, and so on each time). In `js/data.js`, update `APP_VERSION` to match.
   **This step matters.** The tablet keeps its offline copy of the app until `CACHE_NAME` changes.
3. On GitHub, open the repository and click **Add file**, then **Upload files**. Drag in the changed files, keeping their folders (drag the `js` folder for files in `js/`). Commit.
4. Wait a minute. Open the app on the tablet while you're online, close it, and open it again. The second launch runs the new version. Your data isn't touched.

### Try it on your computer first (optional)
You need Python installed. In a terminal, inside the `pantry-app` folder, run:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. The data you import here stays in that computer's browser and is separate from the tablet.

---

## How the code is organized

```
index.html             the page shell: navigation + an empty <main> each screen draws into
manifest.webmanifest   app name, icons, full-screen mode (lets Android install it)
sw.js                  service worker: saves the app files for offline use
css/styles.css         all the styles; colors at the top, dark mode right below them
js/app.js              starts the app, shows the right screen for #today, #week, ...
js/db.js               the on-device database (IndexedDB), explained as SQL-style tables
js/data.js             import and export of the JSON file
js/rules.js            diet rules: whose food is whose, never-words, the meat and rennet checks
js/ui.js               shared helpers: dialogs, toast messages, tag chips, the jar gauge, dates
js/meals.js            days and meals: totals, the meal editor, ideal day, copying days
js/campaign.js         fitness campaign rules: regions, quests, XP, levels, gold, travel weeks, the 5K track
js/sprite.js           the pixel-art hero (a small text map, one letter per pixel)
js/today.js  quests.js  week.js  pantry.js  groceries.js  recipes.js  settings.js   one file per screen
fonts/                 Cinzel and EB Garamond, bundled so they work offline (SIL Open Font License)
icons/                 home-screen icons
```

Every screen follows the same pattern. `render(main)` reads from the database, builds the HTML as a string, and puts it on the page. Buttons carry `data-act="..."`, and one click handler per screen checks that value to decide what to do. After a change, it saves to the database and calls `render` again.

**The campaign:** each Done tap adds a row to the `questLog` table. XP is the total of those rows, gold is XP minus what you've spent on rewards, and your level comes from XP (level 2 at 100, 3 at 300, 4 at 600, each level needing 100 more). Quest names and XP can be changed in **Settings → Quests and your hero**. Your hero's name and your partner's name for co-op quests come from your data file, not the code.

The personal rules (which tags mean "not my food", and which words should never show up in a meal) aren't written in the code. They come from your data file, and you can edit them under **Settings → Diet rules**.

### Troubleshooting
- **No "Install" option:** make sure the address starts with `https://` and ends with `/pantry-app/`. Wait a few minutes after turning on Pages.
- **Blank page:** `index.html` probably ended up inside a subfolder. It has to be at the top level of the repository.
- **Old version keeps showing:** you probably forgot to bump `CACHE_NAME` in `sw.js`.
- **Data disappeared:** import your latest backup from Settings.
