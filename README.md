# KoshVista

An open-source, responsive personal-finance workspace for accounts, cash, spending, budgets, investments, fixed deposits and bonds.

## Architecture

- React 19, TypeScript, Vite, Inter, Radix Dialog, Lucide and ECharts.
- Neon PostgreSQL, Managed Auth, Functions and private Object Storage.
- Vercel static hosting (Cloudflare configuration retained for future use). No Supabase service is used.
- Decimal.js calculations; browser CSV/PDF/OCR processing; optional local MobileBERT category suggestions with Transformers.js.
- AES-256-GCM encrypted archives, PBKDF2-SHA256 derivation and Google Drive appDataFolder backup integration.

## Local development

Use Node.js 24. Copy `.env.example` to `.env.local`, configure your own services, then:

```sh
npm ci
npm run dev
```

`/demo` is a clearly labelled, in-memory sample workspace. `/app` requires Neon sign-in and a configured API. Real workspaces are never seeded with sample financial data. No credentials belong in frontend `VITE_` variables.

For the local API, set `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` and `APP_ORIGINS`, remove `VITE_API_URL` to use the Vite proxy, then run `npm run dev:api` in another terminal. Apply migrations with `npm run db:migrate` using the database owner connection.

## Verification

```sh
npm run build
npm test
node --env-file=.env.local node_modules/.bin/tsx scripts/check-isolation.ts
node --env-file=.env.local node_modules/.bin/vitest run tests/api.integration.test.ts
```

The integration suite uses **synthetic JWT identities** to test the API against real PostgreSQL; it does not validate Google OAuth itself. It creates explicitly named test fixtures and removes them afterwards. Use a dedicated development database for integration tests. The separate isolation check rolls back its test transaction.

## Data behaviour

- Signed ledger amounts; own-account transfers are paired and excluded from income/spending.
- Imported rows retain file-hash and line provenance. Reimporting a source is idempotent. Cross-statement matches are conservatively skipped for manual investigation.
- PDF/OCR candidates require review. Generic parsers do not claim certified compatibility with every bank layout.
- Investment snapshots have an explicit valuation date. Unknown cost basis remains unknown. No paid live-price feed or bank scraping.
- New FDs can post an atomic funding movement; existing historical FDs can be recorded without a second cash debit. Projections are separate from actual maturity payouts.
- Encryption passphrases and Drive access tokens remain in memory. Automatic independent Drive backup requires the app to remain open and Google authorisation to remain valid. Normal saves persist to Neon independently.
- Archive restore requires the same signed-in identity and an empty workspace. Original binary documents are excluded from archives.

## Deployment status and remaining validation

See [BUILD_STATUS.md](BUILD_STATUS.md). Provisioning, local tests and a successful build are not a claim that all production integrations have been verified.

## Free operation

The architecture uses free tiers and local inference, with no paid AI gateway. Providers enforce quotas and can change terms; do not enable paid upgrades without deciding to do so. Hosting your own copy requires your own service accounts and OAuth configuration.

## License

Apache-2.0. Third-party libraries and model weights retain their own licences. The optional classifier is [Xenova/mobilebert-uncased-mnli](https://huggingface.co/Xenova/mobilebert-uncased-mnli); verify its suitability before relying on suggestions.

## Vercel deployment

The `koshvista` project is linked to `Ritik0712-ai/koshvista` on the Vercel Hobby plan. `vercel.json` selects Vite, builds with `npm run build`, serves `dist`, configures SPA deep links and applies security headers. Public browser endpoints are read from `.env.production`. Neon still runs authentication, PostgreSQL, API functions and private storage. Add only the verified production origin to Neon Auth trusted domains and API CORS.

## Cloudflare deployment (retained)

The existing `koshvista` Worker is connected to this repository. Its deploy command is `npx wrangler deploy`; `wrangler.jsonc` runs `npm run build` and uploads only `dist`, with SPA navigation fallback. Leave the separate dashboard build command empty to avoid building twice. `.env.production` contains only public browser endpoints; override those for your own deployment. Keep all credentials in ignored `.env.local` or server-side secret storage. The Hono API is deployed separately to Neon Functions.

## Import and save workflow

Choose bank statement, portfolio or FD/bond, upload a CSV/PDF/image, and review the extracted text. **Save document** persists the source independently of financial rows. Keeping the original stores it privately in Neon. Review and save transactions/holdings/deposits separately; repeated imports are detected. Saved sources appear in the document library, and ledger descriptions open transaction details with source evidence.

**Suggest categories** runs an optional local classifier. Progress and errors are visible; suggested rows remain unchecked until reviewed. OCR and AI can make mistakes. Password-protected PDFs accept an in-memory password that is never saved.

Production Google/Drive setup is documented in [GOOGLE_SETUP.md](GOOGLE_SETUP.md).

### Multiple screenshots

Select up to **six PNG/JPEG screenshots** of the same statement, portfolio or holding in one upload (20 MB total). Each image is read sequentially; extracted text and records appear in one review. **Save N screenshots** retains all unmodified originals in one private ZIP archive. Opening the saved original downloads that archive. PDF and CSV imports remain one file at a time. Possible overlapping transaction rows remain unchecked, and repeated identical holding records must be removed or corrected before posting.

### Saved documents awaiting import

Saving a document stores its evidence only. The library labels unprocessed sources **Saved only · review needed** and offers **Review and import records**. Reopen a saved source as investments, bank activity or an FD/bond without uploading it again; retain its original hash and private file. **Read saved original again** retries local extraction. Portfolio filenames/headers are detected, multiline share layouts produce editable candidates, missing prices remain blank and incomplete holdings cannot be posted. Dark screenshots receive a second contrast pass, but OCR values still require checking against the original. Confirmed holdings update investments and net worth; they do not create bank income or spending.

### Axis statement reconciliation

Axis text PDFs are read by page coordinates, preserving wrapped narration and transaction lines. The review derives debit/credit signs from successive running balances and checks each amount, both printed totals and the closing balance. Missing or contradictory rows block posting. A statement-based account helper uses its documented opening date and balance; a 50-row review pager supports long statements. Possible own-account movements require classification, investment movements stay outside income/spending, and matching same-day UPI reversals are suggested as refunds. Other bank layouts still require individual verification.
