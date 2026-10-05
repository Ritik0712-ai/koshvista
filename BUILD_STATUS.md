# Build checkpoint — 5 October 2026

## Live application

- Website: https://koshvista.vercel.app (Vercel, Git-linked main).
- Repository: https://github.com/Ritik0712-ai/koshvista.
- Neon project `soft-tree-07106322`, main branch `br-frosty-meadow-b33rc0ok`, Singapore.
- Neon manages PostgreSQL, authentication, the API function and private source-document storage. Supabase is not used as a service.
- Nine database migrations applied, including source extraction metadata, splits/tags, calendar reminders, documented coupon frequency and edit history.
- Credentials remain in ignored `.env.local`; browser endpoints are public configuration.

## Implemented

Responsive dashboard; bank, cash and investment accounts; transaction ledger and paired transfers; category splits and tags; monthly budgets; investment trades, reversal and dated valuations; funded FDs, actual maturity payments and periodic interest; liabilities; recurring payments with calendar reminders; chart filters, data tables and exports; saved bank/portfolio/FD source documents, private originals, extracted text, import receipts and duplicate protection; transaction source evidence and edit history; encrypted archive export/restore; session management and account deletion; privacy page and installable public app shell.

Document reading and optional AI classification run in the browser. Local AI suggests categories, with scores and review required. It does not invent balances, guarantee correct OCR, execute financial trades or provide live market prices. Save document works independently of posting reviewed financial records.

## Verified

- Real Google login and authenticated workspace loading on the public site.
- Public screenshot OCR and portfolio review; public local-model inference returns editable suggestions.
- Private original upload/download and storage CORS against synthetic test identities.
- Unit coverage for decimal arithmetic, cash/transfer accounting, dated portfolio values, category splits, calendar reminders, coupon estimates, CSV safety and encrypted archives.
- Live PostgreSQL/API integration coverage for ownership isolation, transfers, import retries, source persistence, portfolio imports, funded maturity payouts, oversell/reversal protection, split validation, recurring payments and archive restoration. Test authentication is synthetic; real OAuth is separately verified in the browser.
- Production TypeScript/build and GitHub frontend verification pipeline.

## Remaining external configuration and acceptance work

- The current Google login uses Neon's shared development provider. Supply an own production Google OAuth client as described in [GOOGLE_SETUP.md](GOOGLE_SETUP.md).
- Google Drive integration is implemented but its own client configuration and real consent/upload/download/restore verification remain pending. Encrypted downloads and normal Neon saves work independently. Automatic Drive backup requires the website to stay open, an in-memory passphrase, network and valid Google authorisation.
- Representative redacted bank/broker statements are needed to certify specific institution layouts. Generic text/OCR extraction requires review and can miss fields.
- Cloudflare account publishing remains blocked; Vercel is the active host.
- Backend function deployment is currently a separate controlled CLI step; frontend main pushes automatically deploy through Vercel.

This checkpoint distinguishes implemented functionality from unverified external integrations; it is not a claim that every production acceptance criterion is complete.

## Screenshot batch update

Up to six PNG/JPEG images can be imported together within the 20 MB source limit. Extraction combines them into one review with per-image progress. Originals are preserved in a deterministic ZIP archive; selection order changes do not create a new source hash. Repeated identical images are rejected. Possible overlapping transaction rows remain unchecked; repeated identical holding records block posting until corrected. Synthetic six-image browser OCR produced six review records without errors.
