# Ελληνικά A2

A phone-first web app for daily Greek practice at A2 level: vocabulary in context and verb conjugation, with Russian translations. It works offline, installs to the home screen, and keeps progress on the device.

## Screens

- **Εξάσκηση**: a Greek sentence with a missing word and four options (sometimes a Russian word to translate into Greek).
- **Ρήματα**: verb + tense + person, pick the right form. Tenses are switchable.
- **Στατιστικά**: daily goal, streak, remembered words, activity calendar, settings, export and import of progress.
- **Λέξεις**: the whole word list with search, status filters and examples.

A word counts as remembered after four correct reviews spread over about eleven days, or when you tap "Το ξέρω". A wrong answer sends it back to learning.

## Commands

```bash
npm install
npm run dev        # local development
npm test           # unit tests
npm run content    # rebuild src/data from content/raw
npm run build      # production build in dist/
```

## Content

`content/raw` holds the source files: 16 topic sets of words (each word has two gap sentences with three wrong options and Russian translations) and three sets of verb conjugation tables. `npm run content` validates and merges them into `src/data` and writes what it dropped to `content/build-report.txt`.

The content was generated and proofread by AI. If you find a mistake, fix it in `content/raw` and run `npm run content`.

## Deploy

Pushing to `main` builds and publishes the app with GitHub Actions (`.github/workflows/deploy.yml`). In the repository settings, set Pages → Source to "GitHub Actions".

## Progress and backups

Progress is stored in the browser (IndexedDB, with a localStorage copy). It lives on one device and one browser, so use "Εξαγωγή προόδου" on the stats screen from time to time to keep a backup file.
