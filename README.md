# Form & Field

An offline-first workout journal built from `current_worksheet.xlsx`. React + TypeScript + Vite, with browser-local SQLite and optional Google Drive JSON backups. The interface adapts to phones, tablets, and laptops.

## Run locally

Use Node 24+ and npm:

```sh
npm ci
npm run dev
```

Open the URL Vite prints. Localhost and HTTPS support the browser storage APIs this application needs. Dependencies require network access on the first install.

```sh
npm test
npm run build
npm run preview
```

The build writes only deployable public assets to `dist/`, generates the offline service worker, and checks the artifact for private workbook content. A committed dependency lock pins the toolchain. The application uses hash navigation, so GitHub Pages needs no server-side route fallback.

## Restore your existing worksheet results

The checked-in routine has **blank personal results**. It includes all four workout days, the 160-exercise library, progression guidance, and links. Existing workout notes and loads are not published.

With Python 3 and the original workbook present:

```sh
npm run convert
```

Review `.private/conversion-review.json`, then open **Data & sync → Open JSON preview**, choose `.private/workbook-results.json`, and select **Replace local data** in Editor mode. The app keeps a recovery copy of the prior dataset.

The conversion report documents Excel date-to-rep-range recovery and the decision to keep all populated worksheet weight cells as private exercise summaries, rather than public prescriptions. For example, Excel’s June 8 value in the reps column is recovered as 6–8 reps. Worksheet sessions and undated baseline rows use the week start as a placeholder date because no individual workout dates were recorded. Original per-exercise weights, effort, completion, and notes are retained; individual set performance is initially blank because the worksheet does not record it. Baseline tests with no load remain untested; historical retest examples are preserved as imported history.

To intentionally regenerate the sanitized starter routine after changing the source workbook:

```sh
python3 scripts/convert_workbook.py --public
python3 scripts/test_conversion.py
```

The converter uses only Python’s standard library. Private results, conversion reports, XLSX files, and local environment files are ignored by Git and excluded from the public build. Keep the original workbook locally; it is not needed to run the deployed app.

## Using the journal

- **Workout:** choose a week/day and session date, log each set, enter notes and the worksheet’s effort scale, and mark completion or Modified. Loads accept numbers or labels such as `BW`, `20s`, or an assisted-machine setting. Set logging and exercise-level completion are separate so imported summaries stay faithful to the worksheet.
- **New week:** copy the chosen week’s prescriptions without copying results. Add exercises and edit target sets, reps, load, type, notes, and optional supersets within that week. Unlogged exercises can be replaced or removed; logged movement identities stay fixed to preserve history. Earlier weeks and actual set values are retained. Superset sets can be logged separately.
- **Reader:** inspect workouts and imported previews without editing journal data. This is a convenience mode, not a security boundary.
- **History:** browse recorded sessions and reopen a date. “Week complete” is a local status; it sends no coach notification.
- **Strength:** record baseline/retest loads and reps. Estimated 1RM uses the worksheet’s formula and single-rep special case; training max is rounded to 90%, next goal to 105%, and the load matrix shows 65–90% of training max.
- **Animations:** 29 original SVG movement loops cover every exercise in the four-day routine. They pause offscreen and respect reduced-motion settings. Remaining library movements retain optional external form tutorials.

## SQLite and offline behavior

The database is a real SQLite file managed by the official `@sqlite.org/sqlite-wasm` package in a worker. `opfs-sahpool` stores it in the browser’s Origin Private File System without special COOP/COEP headers. Only one tab for this application path opens it at a time. Close the first tab before retrying in another.

Databases and service-worker caches are scoped to the application path. Updating on the same GitHub Pages URL preserves progress; changing origin or repository path creates a separate browser storage area. Clearing site data removes the database and remembered settings. Browser/OS storage eviction is also possible: keep JSON or Drive backups.

The service worker caches application assets, the routine, SQLite WASM, and all illustrated loops after the first successful online visit. It does not cache Google API calls or external JSON downloads. Optional Google Fonts fall back to system fonts offline. New worker versions activate after previous tabs close.

When persistent storage is unavailable, the UI clearly labels a temporary session. Initialization failures of an existing OPFS database are surfaced rather than silently switching to a new empty database. Failed saves leave edits on screen with retry and JSON export. Drive uploads use committed database snapshots and are disabled while saving has failed or remains pending.

## JSON format and replacement

`src/model.ts` defines the strict, versioned format. A backup includes `schemaVersion: 1`, dataset/revision/parent IDs, an export timestamp, exercise catalog, weekly prescriptions, sessions and set results, strength tests, and progression guidance. Loads retain their original labels. Device connection preferences, tokens, and SVG assets are excluded.

Local imports and HTTPS URL downloads use the same validator and 10 MB limit. URL hosts must allow CORS and return the JSON directly; a cloud provider’s HTML sharing page is not a direct JSON URL. Use the Drive panel for private Drive files. Downloaded data first opens as an isolated preview, leaving the local journal intact. Replacement requires Editor mode and confirmation, with a transactional recovery snapshot. **Open recovery copy** previews the dataset saved immediately before the last replacement.

There is no automatic merge or background upload. To move between devices: upload on the first device; connect Drive, choose the file, download and import it on the second device; log progress; then upload. Review changes before overwriting a backup from another device.

## Configure Google Drive

Local logging and local JSON files work without Google setup. For Drive:

1. Create a Google Cloud project and enable **Google Drive API**. Enable **Google Picker API** if users will select existing backups.
2. Configure the Google Auth Platform consent screen. The application requests only `https://www.googleapis.com/auth/drive.file`. During testing, add the intended Google accounts as test users. Follow Google’s production/publishing requirements before broader use.
3. Create a **Web application OAuth client**. Add the exact JavaScript origins, such as `http://localhost:5173` and `https://YOUR_ACCOUNT.github.io`. Origins contain no repository path. Add a custom-domain origin too if used.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`. For Picker, also set `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` to the project’s numeric project number. Restrict the browser API key to the site’s HTTP referrers and the required API.
5. Restart Vite. Connect Google Drive from **Data & sync**. Upload creates `gymtracker-backup.json` in the signed-in user’s Drive; subsequent uploads update its saved ID. Picker can select an existing JSON file and grant this app access to it.

These Vite values are public browser configuration, **not secrets**. Never put an OAuth client secret or service-account key into the browser build.

Check **Remember my destination** to retain the Drive file and URL. The cookie stores only this preference (180 days; path-scoped; SameSite=Lax; Secure on HTTPS), with destination metadata in local storage. OAuth access tokens live only in memory. Google may require reconnection after expiry or reload, even when the destination is remembered. Unchecking the preference removes remembered connection settings. Disconnect revokes the current token while retaining destination selection.

Uploads compare remote versions before replacement. Unseen changes require downloading/reviewing or explicitly choosing Overwrite. If an ETag is exposed, updates also send If-Match. This is manual backup synchronization, not transactional multi-user collaboration; avoid simultaneous writers. Deleted files, permission failures, and expired access never delete local workout data.

Official references: [SQLite persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md), [Google browser authorization](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Publish to GitHub Pages

1. Push this project to a GitHub repository with a `main` branch.
2. In **Settings → Pages**, choose **GitHub Actions** as the deployment source.
3. For Drive, add repository **Actions variables** named `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, and `VITE_GOOGLE_APP_ID` as needed.
4. Push to `main` or run **Deploy workout journal** manually. The workflow tests, builds, scans public assets, uploads only `dist/`, and deploys it. Its Pages configuration supplies the repository base path automatically.
5. Confirm the live URL in the deployment result. Configure that origin in Google Cloud and verify a backup upload/download there.

Publishing does not upload your browser database. The original workbook and `.private/` import files must stay excluded from source control. A JSON backup intentionally contains your personal workout results; only share it with intended readers.

For a manual project-path build:

```sh
BASE_PATH=/YOUR_REPOSITORY/ npm run build
```

## Tests and verification status

```sh
npm test
python3 scripts/test_conversion.py
npx playwright install chromium
npm run test:e2e
```

The converter test needs the original workbook. JavaScript tests cover schema/URL validation, strength formulas, history copying, native SQLite transactions and recovery, and mocked Drive create/update/conflict/auth flows. Browser tests exercise the real WASM/OPFS build, reload persistence, Reader restrictions, import/recovery, offline revisits, competing tabs, and mobile overflow.

In the implementation environment, **19 JavaScript tests and 4 converter tests pass**, and TypeScript checking passes against the official SQLite declarations. A UI-only production compilation passes using a temporary database fixture. A complete production build and browser acceptance run could not be verified: the sandbox blocks package-network access, local listening sockets, and Chromium startup; SQLite’s runtime/WASM package was not available in the local dependency cache. The fixture is not part of the project or deployment. Run `npm ci`, `npm run build`, and the browser tests in an unrestricted development environment before publishing. Live Google authorization and the deployed Pages URL remain unverified until configured.

[GYMTRACKER_PLAN.MD](GYMTRACKER_PLAN.MD) records the implementation scope and acceptance criteria.
