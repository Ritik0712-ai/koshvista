# KoshVista — Technical Requirements Document (Website)

**Status:** Website architecture, revised 2026-10-04. Neon provides all application backend capabilities. No implementation or cloud resource creation is authorised by this document.

## 1. Architecture and deployment target

KoshVista is a responsive React/TypeScript website with optional PWA installability. A static frontend deploys on **Cloudflare Pages Free** from the new public GitHub repository. **Neon Free** is the complete application backend: Lakebase Postgres for financial records, Managed Better Auth for login, Neon Functions for the authenticated API, and private Neon Object Storage for retained documents. Use an AWS Neon region where all three backend services are available; `aws-ap-southeast-1` is the preferred India-adjacent candidate after checking availability. No database credential or storage key reaches the browser.

```text
Browser/PWA: React UI, charts, import workers, short-lived local drafts
    ├─ Neon Managed Better Auth → user session / signed token
    ├─ authenticated HTTPS → Neon Function API → Lakebase Postgres
    ├─ authorised short-lived upload URL → private Neon Object Storage
    └─ separate Google Drive OAuth → encrypted backup in user's appDataFolder
Cloudflare Pages → static website
GitHub → public source, CI and synthetic fixtures only
```

Accepted mutations persist through the Neon API immediately. Drive backup is an independent encrypted recovery copy triggered after changes/when online while the site is open. The UI shows separate **Saved to cloud** and **Drive backup verified** timestamps. Closed-browser background work is not guaranteed.

## 2. Frontend stack and project structure

| Layer | Choice and reason |
| --- | --- |
| Language/build | TypeScript, React, Vite: static deployment without private-dashboard server rendering. |
| Styling | Tailwind CSS plus documented CSS design tokens: consistent responsive UI. |
| Components | Radix UI primitives plus project-owned components: accessible keyboard/dialog behaviour. |
| Charts | Apache ECharts: line/bar/histogram/donut/timeline, drill-down and responsive layouts; pair each with an accessible data table. |
| Server state | TanStack Query: cache, retries, mutation/pending state. |
| Forms | React Hook Form and Zod: typed validation shared with import review. |
| Backend API | Neon Functions with Hono, Drizzle ORM and versioned SQL migrations: verified session, owner-scoped queries and atomic financial writes. |
| Local storage | IndexedDB for temporary drafts/import work; Cache Storage for static assets; never the authoritative ledger. |
| Testing | Vitest, Testing Library, Playwright, axe and SQL policy tests. |

Suggested modules: `src/app` routes/layout; `src/features/{ledger,accounts,cash,budgets,imports,wealth,fixed-income,liabilities,analytics,backup}`; `src/domain` exact finance logic; `src/lib` providers; `functions/api`, `db/migrations`, `db/tests` and `neon.ts` for branch-aware backend configuration. Routes: `/`, `/login`, `/auth/callback`, `/app`, `/app/activity`, `/app/accounts`, `/app/cash`, `/app/budgets`, `/app/imports`, `/app/wealth`, `/app/fixed-income`, `/app/liabilities`, `/app/analytics`, `/app/insights`, `/app/settings/*`. All `/app/*` routes require a valid session.

## 3. Database and domain rules

- Neon Lakebase Postgres is the source of truth. [Schema](05-backend-schema.md) defines tables, keys, indexes and ownership; apply versioned SQL migrations against an isolated Neon branch before production.
- Financial rows carry `owner_id text` linked to the managed `neon_auth.user.id` identity (confirm exact live column type before migration). Owner-aware composite foreign keys prevent cross-user references. Every Neon Function verifies the session and filters by that owner. Database RLS is defense in depth using a non-bypass role and a transaction-local `app.user_id` context, not a browser-facing Data API.
- Money uses `numeric(20,4)` with ISO currency, checks and decimal arithmetic. Never JavaScript floating point for authoritative finance totals. Quantity/rates use higher-precision decimal types.
- Financial aggregates derive from posted rows using tested SQL/functions or decimal domain code. Snapshots are distinct from trades; projections are excluded from realised balances.
- Private Neon Object Storage keys start with owner ID. A Neon Function checks ownership before issuing short-lived upload/download URLs; bucket credentials remain server-side. Process raw uploads in-browser and retain originals only by explicit choice to control storage cost and privacy.

## 4. Authentication, authorisation and sessions

Neon Managed Better Auth provides Google OAuth sign-in through the official Neon Auth client. Ritik supplies a production Google OAuth app and trusted origins; shared development credentials are not for release. Drive backup consent is separate. Session expiry returns to login while preserving an unsent local draft. Sign-out clears local sensitive cache and in-memory Drive tokens. Email/password, password reset and email changes are deferred until a reliable no-fee production SMTP path is verified. Managed Neon Auth currently does not offer MFA; do not claim it does.

Authorisation lives at the Neon Function API and in PostgreSQL ownership constraints/RLS, never UI hiding alone. The browser cannot query Postgres or Object Storage using a database/storage credential. A valid JWT establishes identity, not permission to select arbitrary rows: every endpoint derives owner ID from the verified token and scopes every read/write to it. Cross-user isolation is a release gate.

## 5. Import and intelligence pipeline

1. Browser file picker accepts CSV/PDF/image; validate size, extension, MIME and signature.
2. CSV parser handles quoted fields and debit/credit conventions. PDF.js extracts embedded text. Tesseract.js OCR runs in a Web Worker for scans/screenshots with progress and cancellation.
3. Versioned adapters map known institution formats to typed candidates. Generic fallback never claims certified support.
4. Normalise amount/date/currency/account, calculate source fingerprints and detect statement overlap plus transaction duplicates.
5. Score fields; show evidence/conflicts in a review grid. User accepts/edits/skips; accepted batch posts atomically in a Neon Function database transaction.
6. Record source link, parser version and decision log. Categorisation uses explicit rules first, optional local-model suggestions second; confirmed entries are never silently rewritten.

Unreadable/password-protected PDFs get explicit errors and manual-entry route. Bound page count, file size and OCR memory for mobile browsers. No cloud LLM receives private documents by default.

## 6. Cloud save, encrypted backup and restore

**Primary persistence:** Every committed edit receives an acknowledgement from the Neon Function after its Postgres transaction commits. Failed/pending mutations are visibly unsaved. A new browser loads committed records after sign-in.

**Independent backup:** After Google Drive consent using `drive.appdata`, the browser exports only its authenticated owner's records through a paginated Neon Function, encrypts locally with a user-held recovery passphrase, and uploads to the user's hidden appDataFolder. Use Web Crypto AES-GCM with a random content key. Derive a wrapping key using a reviewed Argon2id WASM implementation if browser performance permits; otherwise use Web Crypto PBKDF2 with documented and tested parameters. The ciphertext envelope stores salt, KDF parameters, schema version and integrity metadata. Never store the passphrase in Neon, Drive or logs. Keep at least two verified versions within quota. Read back metadata/hash or the archive before marking backup verified. Trigger after meaningful changes and when an open page returns online; retry with bounded backoff.

**Restore:** Verify sign-in identity, passphrase, envelope and schema. Preview counts; restore into empty vault or explicitly merge by deduplication. Wrong key, corrupt archive, unsupported schema and quota errors do not modify live data. Provide manual encrypted download as another recovery path.

Neon Free currently includes a short history window and limited manual snapshots, but scheduled snapshots are not on the free plan. Separate Drive backup is therefore required for independent long-term recovery. Neon Free has compute, database, object storage, function, auth and egress limits that must be monitored. A browser cannot promise background backup while closed.

## 7. APIs and integrations

| Integration | Contract |
| --- | --- |
| Neon Managed Better Auth | Google OAuth sign-in/session; production and preview trusted origins restricted. |
| Neon Functions API | Hono HTTPS endpoints; verify JWT, derive owner, validate inputs, transact in Postgres. No browser-to-database connection. |
| Neon Lakebase Postgres | Authoritative ledger, migrations, exact calculations and owner-scoped read models. |
| Neon Object Storage | Optional private source retention; owner key, short-lived signed URL, quota. |
| Google Drive API | Separate OAuth, `appDataFolder`, encrypted archive, revoke/disconnect and recovery states. |
| Institution adapters | Uploaded user documents only; no bank credentials or scraping. |
| Market valuations | Manual/imported values with mandatory date/source; no implied live feed. |

No payment vendor, commercial OCR, paid AI, paid market feed or monitoring SaaS is required. Neon AI Gateway is excluded because it is unavailable on the free plan. Email/password login needs a separately verified no-fee production SMTP provider. Although the initial Google-only flow sends no app authentication email, Neon's production checklist still calls for custom SMTP; confirm an acceptable no-fee configuration or a documented Google-only exception before launch. Do not mark this gate complete by assuming development mail is production-ready.

## 8. Security and privacy

- HTTPS, restricted OAuth origins, CSP, HSTS, dependency scanning and no inline secrets.
- Validate file input and output-escape extracted text; reject formula injection in CSV export, active content and oversized decompression.
- Test owner A, owner B and anonymous reads/writes through every API route and private object path. Use least-privilege DB roles and owner-scoped SQL; service credentials never enter browser bundles.
- Rate-limit privileged endpoints; CSRF/origin checks if cookies are used. Logs contain no amounts, account numbers, document text, tokens or passphrases.
- Authenticated encryption and tested KDF; no recovery bypass. Publish a threat model and private security-reporting route before launch.
- Export/delete user records, remove retained files and revoke Drive consent. Privacy text must accurately explain retention and provider limits.

## 9. Reliability and performance

All queries have loading/empty/error/stale states. Optimistic writes require reliable rollback. Mutations use idempotency keys. Import review can resume without double-posting. Tests cover debit/credit signs, transfer neutrality, split sums, reconciliation, net worth and projection separation. Monitor free quotas. Measure dashboard loading with realistic synthetic fixtures and mobile conditions.

## 10. Deployment and decisions

1. User creates a **new** public GitHub repository, suggested `Ritik0712-ai/koshvista-web`. The Android repository remains separate.
2. After explicit implementation authorisation, build the website in a clean checkout of the new repository. Add Node/Vite ignore rules, Apache-2.0 license, synthetic fixtures and CI. Respect Ritik's Git identity.
3. Create a Neon Free project in a supported AWS region and a Cloudflare Pages Free site under the owner's accounts. Configure Neon Auth, a private Object Storage bucket and a Function API; keep connection and S3 credentials server-side. Connect GitHub to Pages and configure Google OAuth/trusted origins.
4. Apply migrations/security tests before real data. Test preview deployment, accessibility, import idempotency and clean-browser recovery.
5. Publish only after all release gates pass; document export/migration and free-tier usage. No paid auto-upgrade.

**Decision rationale:** Static hosting avoids an always-on server; Neon combines Postgres, managed login, APIs and private object storage on one free backend; browser OCR limits document exposure; Drive provides an independent user-owned backup. This is a zero-required-fee design within current published limits, not an unlimited-service guarantee.

## 11. Official references

- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Neon pricing and Free limitations](https://neon.com/pricing)
- [Neon Managed Better Auth](https://neon.com/docs/auth/overview)
- [Neon Auth production checklist](https://neon.com/docs/auth/production-checklist)
- [Neon Functions](https://neon.com/docs/compute/functions/overview)
- [Neon Object Storage](https://neon.com/docs/storage/overview)
- [Google Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
