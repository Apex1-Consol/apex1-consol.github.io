# ApexOne redesign preview (isolated)

A working preview of the redesign, wired to a **separate free Supabase project** (`apexone-preview`) with test data only.
Live ApexOne (`/index.html`, project `apex-one`) and its ClickUp lists are untouched.

- `index.html`: the redesign mock, plus sign-in and live data (`live.js`) and the QA/ETQA screens (`qa.js`: Tracker, Moderation & Verification, Accreditation, LEISA file, real .xlsx exports), and the delivery screens (`delivery.js`: Programmes with Form 3, Attendance register and PoE tracker, EISA readiness)
- `migrations/`: preview-only SQL for the QA/ETQA screens (schema, test data, full Pre-2009/NATED list)
- `adapter/`: the deployed `preview-clickup-adapter` (copy of the live adapter, remapped to the TEST folder and guarded)
- `tests/`: `page.test.js` (15), `guard.test.js` (27), `db.test.sql` (20, rolls back)
- `GAP-REPORT.md`: every screen against the live app; what is real and what is still mock
- `E2E-CHECKLIST.md`: setup and manual test run

Open it locally (double-click `index.html`, keeping `live.js`, `qa.js` and `delivery.js` in the same folder) or from any static host.
Do not merge this folder into `main`; see the go/no-go section of the gap report.
