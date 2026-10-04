# KoshVista

An open-source, responsive personal-finance workspace for accounts, cash, spending, budgets, investments, fixed deposits and bonds.

## Architecture

- React 19, TypeScript, Vite, Inter, Radix Dialog, Lucide and ECharts.
- Neon PostgreSQL, Managed Auth, Functions and private Object Storage.
- Cloudflare Workers Static Assets hosting. No Supabase service is used.
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

## Cloudflare deployment

The existing `koshvista` Worker is connected to this repository. Its deploy command is `npx wrangler deploy`; `wrangler.jsonc` runs `npm run build` and uploads only `dist`, with SPA navigation fallback. Leave the separate dashboard build command empty to avoid building twice. `.env.production` contains only public browser endpoints; override those for your own deployment. Keep all credentials in ignored `.env.local` or server-side secret storage. The Hono API is deployed separately to Neon Functions.
