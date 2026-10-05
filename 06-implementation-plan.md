# KoshVista — Website Implementation Plan

**Status:** Website specification. Implementation was subsequently authorised by the user. Vercel is now the active host; Neon remains the sole application backend. See BUILD_STATUS.md for implemented and verified delivery status.

The release target is the complete finance website defined in [the PRD](01-product-requirements.md). Phases are an engineering order with reviewable deliverables, not a beginner edition or permission to ship a partial app. All generated project artefacts remain inside `/Volumes/RitikSSD/Projects/Ultimate Expense Tracker/`. The new public website repository is separate from `koshvista-android`; preserve the existing Android checkout and uncommitted work.

## Phase 0 — Repository and decision freeze

**Work:** Ritik creates `Ritik0712-ai/koshvista-web` as a public Apache-2.0 repository. Confirm product scope, privacy copy, free-tier limits, institution priority and cloud accounts. Transfer six specs to the new repo only after it exists. Before first commit, verify local Git identity `Ritik Agarwal <ritikagarwal2468@gmail.com>`; never add a `Co-Authored-By` trailer. Scan staged content for secrets and real finance data.

**Deliverables:** New repository link, specification baseline, issue/decision log, contribution/security guidance and source-only README. **Gate:** No existing Android code or private files are accidentally published to the web repo.

## Phase 1 — Setup and delivery foundation

**Work:** Create React/TypeScript/Vite project in a clean new-repo checkout; add Tailwind tokens, lint/format/typecheck, Vitest, Playwright, accessibility checks, synthetic fixture generator and CI. Configure Vercel preview/production deployment and environment variable names without committing secrets. Add licence and Node/Vite ignore rules if GitHub did not create them.

**Deliverables:** Deployed placeholder shell, reproducible local build, green CI, light/dark responsive foundation. **Gate:** 360 px and desktop smoke tests, zero paid services.

## Phase 2 — Authentication and security boundary

**Work:** Create Neon Free project under Ritik's account in a supported AWS region. Configure Managed Better Auth with owner-controlled Google OAuth credentials and trusted origins; implement sign-in, session expiry, sign-out and onboarding. Set up a Neon Function API with JWT verification, an application database role and owner-scoped access tests for owner A, owner B and anonymous callers. Add secure headers, CSP and no-secret bundle checks. A production email/password path remains contingent on no-fee SMTP verification.

**Deliverables:** Working Google login and account isolation. **Gate:** Every route and initial table blocks anonymous/other-user access; Neon credentials remain server-side. Complete Neon Auth's production checklist, including resolution of its custom-SMTP requirement without a fee or a confirmed Google-only exception.

## Phase 3 — Database and deterministic finance engine

**Work:** Apply versioned migrations from [schema](05-backend-schema.md) to a Neon development branch. Implement accounts/cash, ledger, transfers, splits, categories, budgets, recurring rules and reconciliation behind authenticated Neon Functions. Define exact decimal arithmetic and dated FX handling. Add idempotency and audit trail. Build query/read models for dashboard and charts.

**Deliverables:** Functional bank/cash ledger with reliable totals and policy tests. **Gate:** transfer neutrality, split sums, duplicate mutation and balance fixtures pass.

## Phase 4 — Core website UI and analytics

**Work:** Implement [flow](03-app-flow.md) and [design](04-ui-ux-design-brief.md): responsive shell, dashboard, accounts, cash, activity, budgets, analytics, chart drill-down, text tables, filters and export. Use real read models rather than placeholder numbers.

**Deliverables:** Fully navigable, data-driven finance UI on mobile and desktop. **Gate:** charts reconcile to underlying rows; keyboard/screen-reader/contrast checks pass.

## Phase 5 — Investments, fixed income and liabilities

**Work:** Add instruments, documented trades, snapshots, valuations, FD/bond terms, projected schedules, actual payout links, maturity reminders and liabilities. Mark unknown cost and stale valuation explicitly. Test realised versus projected totals.

**Deliverables:** Wealth, fixed-income and liability journeys with source-linked calculations. **Gate:** screenshots cannot create invented trades; projections never inflate posted cash.

## Phase 6 — Import and AI-assisted review

**Work:** Implement browser CSV/PDF/image extraction, OCR worker, institution adapters, candidate confidence, duplicate detection, review grid, atomic posting through Neon Functions and source audit. Add a private Neon Object Storage bucket for opt-in original retention, with owner-checked short-lived upload/download URLs. Start with synthetic/redacted formats; certify named institutions only when fixtures pass. Add categorisation rules and explainable suggestions; a local model is optional only if it demonstrably improves quality without fees.

**Deliverables:** Reviewable, repeat-safe imports for bank activity, portfolio snapshots and FD/bond terms. **Gate:** reimport/overlap fixtures produce no duplicates; bad extraction never silently posts.

## Phase 7 — Cloud backup and recovery

**Work:** Distinguish cloud save from Drive backup. Configure separate Google Drive OAuth consent. Implement browser encryption, user-held recovery passphrase, versioned appDataFolder archives, verification, retry while open/online, manual encrypted download and clean-browser restore. Add quota, wrong-key, corruption and schema-migration cases.

**Deliverables:** Tested cloud persistence and independent encrypted recovery copy with visible timestamps. **Gate:** clean-browser sign-in retrieves database records; encrypted archive restore succeeds and failure leaves existing records intact. Closed-browser backup limitation is stated.

## Phase 8 — Integrations and institution coverage

**Work:** Collect only synthetic or thoroughly redacted examples for Axis, HDFC, SBI, Kotak, ICICI, Groww, Zerodha and INDmoney in user-priority order. Version adapters, fixtures and support matrix; distinguish certified formats from generic OCR. Assess free-tier usage, auth-email limits and storage retention. Avoid credential scraping or unlicensed feeds.

**Deliverables:** Tested format support matrix, import diagnostics and quota dashboard. **Gate:** Every “supported” format has regression evidence.

## Phase 9 — Testing, privacy and reliability

**Work:** Unit/property tests for decimal finance logic; Neon Function authorization and SQL RLS tests; end-to-end import, transfer, backup and restore journeys; browser coverage for current Chrome/Firefox/Safari and Android Chrome; accessible chart-table parity; performance with realistic synthetic volume; security review for XSS, file uploads, OAuth redirects, token leakage and Neon credential exposure.

**Deliverables:** Test report, threat model, privacy policy, incident/recovery runbook, verified export/deletion. **Gate:** No critical defects, cross-user access or unverified backup claims.

## Phase 10 — Deployment and final polish

**Work:** Deploy production frontend via Cloudflare Pages from main after CI. Deploy Neon schema, Auth, Function and Object Storage configuration on the production branch; set authorised origins and secrets, backup retention, monitoring within free quotas and rollback. Review copy, empty/error/stale states, PWA install experience and source documentation. Test with Ritik's own account and phone using non-sensitive fixtures before importing actual documents.

**Deliverables:** Public website URL, tagged open-source release, setup guide, privacy/security docs and a final verification report naming what was actually tested. **Gate:** Complete PRD journeys pass in production; release has no required payment or auto-upgrade.

## Completion definition and owner actions

Complete means the full release gates above pass, not merely a successful build or attractive dashboard. Ritik must create/own the new GitHub repository and service accounts, complete OAuth provider consent/configuration, retain the recovery passphrase, and optionally supply redacted institution examples. The agent can perform implementation after explicit start approval, but it cannot grant itself a user's financial-provider consent.

## Free-tier risk register

| Risk | Response |
| --- | --- |
| Neon Free has short history and no scheduled snapshots | Independent Drive archive, verified restore and visible warning; recheck pricing before launch. |
| Neon Free API/function/storage/compute quotas | Monitor usage, keep raw document retention opt-in, preserve export/migration path; no silent paid upgrade. |
| Neon Auth production checklist calls for custom SMTP | Resolve a no-fee production mail path or confirm a Google-only exception before launch; development shared mail is not sufficient. |
| Database/storage/egress limits as users grow | Quota monitoring, document-retention choice, export/migration path; no silent paid upgrade. |
| Browser closed when network returns | Cloud database keeps last committed data; Drive backup resumes only on next open/active session. |
| OCR and institution layout variance | Confidence review, adapter fixtures, manual route and honest support matrix. |
| Public repository leakage | Ignore rules, secret scan, synthetic fixtures and staged diff review before push. |
