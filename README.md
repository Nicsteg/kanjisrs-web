# KanjiSRS Web

A new standalone website project built from the existing `AndroidStudioProjects/KanjiSRS` app data.

## What it uses from the Android app

Copied from the app without modifying the app itself:

- `app/src/main/assets/kanji_data.json`
- `app/src/main/assets/vocab_data.json`
- `app/src/main/assets/jmdict_fallback_vocab.jsonl`

Adapted into the website:

- kanji browsing
- curated vocabulary search
- optional JMdict fallback search
- study list
- spaced repetition scheduling
- local progress saving

## What it does not change

This project does **not** delete, edit, or replace the original Android app.

## Website features

- Browser-based kanji grid
- Search kanji, readings, and meanings
- Search curated vocabulary
- Load and search the JMdict fallback dictionary
- Add/remove study cards
- Review cards with Again / Hard / Good / Easy ratings
- Progress saved in `localStorage`
- Export/import progress backup files for moving study data between devices
- Light/dark theme toggle

## JMdict fallback note

The fallback file is large:

- `data/jmdict_fallback_vocab.jsonl`

So the website now loads it **on demand** from the Search tab instead of loading it immediately on page open. After you click **Load JMdict fallback**, the site fetches and parses the dictionary into browser memory and includes those results in search.

## Moving progress between devices

Use the **Backup & transfer progress** section on the Home tab:

1. Click **Export progress** to download a JSON backup file.
2. Move that file to another device however you want.
3. Open the site on the other device and click **Import progress**.

This is a manual cross-device sync flow. The site still works fully offline and does not require accounts or a backend.

## Run locally

Use a local server so `fetch()` can load the JSON files.

### Option 1: Python

```bash
cd C:/Users/nicks/github/kanjisrs-web
python -m http.server 8080
```

Then open:

- http://localhost:8080

### Option 2: Node

```bash
npx serve C:/Users/nicks/github/kanjisrs-web
```

## Project structure

- `index.html` - app shell
- `styles.css` - styling
- `app.js` - web app logic and SRS behavior
- `data/kanji_data.json` - copied kanji data
- `data/vocab_data.json` - copied curated vocab data
- `data/jmdict_fallback_vocab.jsonl` - copied fallback dictionary data
