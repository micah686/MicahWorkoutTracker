# Gymtracker implementation plan

## Summary

Turn `current_worksheet.xlsx` into a mobile-first workout journal on GitHub Pages. Use React, TypeScript, and Vite, with SQLite WASM in a worker and OPFS persistence. Keep workouts usable offline after the first successful visit. Editor and Reader are selectable interface modes, not authentication roles.

## Workbook and application

- Convert Week 0, Exercise Library, and the hidden Lift tests sheet. Preserve four training days, 160 library exercises, supersets, movement types, source links, progression guidance, and strength formulas.
- Recover Excel date-corrupted repetition ranges with a conversion review report. Preserve bodyweight/dumbbell labels, Modified completion, and the worksheet’s 1–20 effort labels.
- Separate the public routine from private results. Publish no athlete name, personal weights, personal notes, or strength history. Generate an ignored private JSON import to restore the existing worksheet results locally. Do not manufacture individual completed sets from worksheet summary rows.
- Track repeatable weeks, dated sessions, individual set reps/load/completion, effort, and notes. Copy prescriptions into a new week with new IDs; keep earlier results intact.
- Include Workout, History, Exercise Library, Strength, and Data & Sync screens. Use large touch targets, bottom navigation on phones, wider layouts on tablets/laptops, accessible forms, focus states, and reduced-motion support.
- Add original animated SVG illustrations for all 29 distinct movements used by the workout. Animate visible cards only; provide pause controls. Keep YouTube references for optional detailed tutorials and library exercises beyond the initial illustration coverage.

## Persistence and interchange

- Store relational workout entities and numbered schema migrations in browser-local SQLite. Use `opfs-sahpool` without cross-origin isolation headers. Scope databases, tab locks, cookies, and offline caches to the application path.
- Keep one active database tab. Show an actionable opening error in other tabs. Use clearly labeled temporary memory only when persistent storage is unavailable, without silently replacing an existing database.
- Autosave committed changes; retain failed edits in the interface, offer retry and JSON export, and never describe a failed write as saved.
- Define a strict version-one JSON format containing dataset and revision IDs, parent revision, export timestamp, exercises, weeks, sessions, set results, strength tests, and progression guidance. Use stable IDs, explicit dates, and string load labels. Exclude tokens and device connection settings.
- Export a device-downloadable JSON file. Local JSON imports and HTTPS URL downloads must validate before an isolated preview. Reader mode may preview and download; replacement requires Editor mode and explicit confirmation.
- Enforce a 10 MB import limit, valid field ranges, unique IDs, and referential integrity. Keep the previous dataset in a recovery snapshot and replace data in one transaction. Network, CORS, parse, and schema failures must leave local results intact.

## Google Drive and deployment

- Use deployment-owned Google OAuth configuration with the limited `drive.file` scope and Google Picker for an existing file. Keep all user data access in the browser; no client secret or backend.
- Explicit Upload takes a committed SQLite snapshot, converts it to JSON, creates a Drive backup initially, and updates that same file ID thereafter. Download uses an authenticated API request and the common preview/import flow.
- Compare remote versions before overwriting; require review or explicit overwrite for unseen changes. Use an ETag precondition when Google exposes it. Do not automatically merge devices or promise atomic multi-user collaboration.
- Remember destination metadata locally and the remember preference in a path-scoped, Secure-on-HTTPS, SameSite=Lax cookie lasting 180 days. Keep tokens in memory; offer Reconnect when Google access expires. Cookies cannot guarantee permanent Google authorization.
- Deploy only `dist/` with GitHub Actions, repository-aware base paths, and hash navigation. Check built assets for private workbook content. Document OAuth origins, Picker settings, GitHub repository variables, local import, and recovery.

## Verification

- Conversion tests: exercise/day counts, reviewed rep ranges, aliases, private summaries, and public privacy.
- Domain tests: JSON round trips, invalid schemas/IDs/URLs, week copying, effort/load labels, and workbook strength formulas.
- Real SQLite tests: relational round trips, reopen, replacement/recovery, malformed imports, and rollback on failed writes.
- Mocked Google tests: create/update, remote conflicts, remembered settings without tokens, authorization expiry, and downloads changing during transfer.
- Browser acceptance: actual WASM/OPFS persistence after reload, competing tabs, local import/recovery, reader restrictions, offline revisits, and layouts at phone/tablet/laptop sizes. Verify on current iOS Safari, Android Chrome, and desktop browsers before release.
- Live Drive and public Pages verification require a configured Google project and an actual GitHub deployment.
