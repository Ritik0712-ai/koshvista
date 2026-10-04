# KoshVista — Product Requirements Document (Website)

**Status:** Website specification, revised 2026-10-04. Neon is the sole application backend provider; this request does not authorise app implementation.

## 1. Overview

KoshVista is a responsive, installable personal-finance website for a complete, source-linked picture of money. It combines bank and cash activity, budgets, investments, fixed deposits (FDs), bonds, liabilities, net worth, imports and rich analytics. Ritik is the first user; later users must have independently owned and isolated data. Source code is public and open source, financial data is private. Desktop and mobile browsers are supported; optional progressive web app (PWA) installation improves phone access.

## 2. Target users and problem

| User | Need |
| --- | --- |
| Ritik | One reliable view of spending, cash, accounts, holdings and net worth with little manual entry. |
| Later individual users | Private accounts, independent data ownership and recovery on a new device. |
| Contributors | Reproducible code and synthetic test fixtures without access to user data. |

Financial records are scattered across banks, brokers, screenshots and cash. Manual spreadsheets duplicate transfers, lose provenance and become stale. A portfolio screenshot does not prove trades or purchase cost. The website must turn uploads into reviewable records, calculate totals correctly and expose evidence behind every number.

## 3. Product principles and constraints

1. **Zero required spend:** Required features work with open-source tools and free service tiers. No card, payment, subscription or paid AI/market-data API is required. Free-tier limits constrain scale; unlimited free hosting is not promised.
2. **Data first:** Every chart has a formula, date range, source/staleness label and drill-down.
3. **Low effort, honest automation:** Imports and categorisation reduce manual work; ambiguous fields go to review. Statement uploads are not live bank connections.
4. **Private by design:** Login is required for financial data. Public source and fixtures contain no real records.
5. **Cloud persistence and recovery:** Accepted edits persist in a cloud database. An independent encrypted backup to user-owned Google Drive is offered after separate consent. The UI distinguishes cloud save from backup. A closed browser cannot guarantee background backup on reconnection.
6. **INR first:** India-focused terms and formats, with currency codes and precise arithmetic.
7. **Deterministic finance:** AI may extract, suggest and explain; totals, balances, interest and deduplication use testable rules.

## 4. Core features and acceptance requirements

| Area | Required behaviour |
| --- | --- |
| Identity | Google sign-in through Neon Auth, session expiry, secure sign-out, data export/deletion and per-user isolation. Email/password may be added only after a no-fee production email-delivery path is verified. |
| Accounts | Bank, cash, credit card, brokerage cash, asset and liability accounts; opening balance, currency, institution and reconciliation state. Cash is first-class. |
| Ledger | Debit, credit, transfer, refund and split records; categories, tags, notes, merchant, search/filter, edit history and source links. ATM withdrawal is bank-to-cash transfer, never an expense. |
| Budgeting | Category budgets, recurring rules, variance charts and alerts from posted records. |
| Imports | CSV/PDF/image for bank, broker, FD and bond records; OCR/text extraction, format detection, duplicate check, confidence and preview before posting. Repeat imports are idempotent. |
| Investments | Instruments, documented trades, dated screenshot snapshots, allocation and dated valuations. Cost basis requires evidence. Stale/manual values are labelled. |
| Fixed income | FD/bond terms, coupon/interest schedule, maturity, projected returns and reminders. Projections stay separate from confirmed cash flows. |
| Liabilities | Loan/credit balances, terms, repayments and net-worth effect. |
| Analytics | Expense/category bars, daily-spend histogram, income versus expense, net-worth trend, allocation donut, cash trend, account lines and maturity timeline; filter and drill down. |
| Assistance | Rules first; optional free/local model only if feasible. Suggestions show confidence and evidence and can be corrected. |
| Recovery | Cloud data loads after sign-in on a new device; separate versioned encrypted Drive backup and tested restore; CSV/JSON export. |

### Import confidence policy

- High confidence: validated fields can be preselected, but an import summary appears before posting.
- Medium confidence: highlight uncertain fields beside original evidence.
- Low confidence or conflict: hold for correction or skip.
- A portfolio screenshot creates a dated snapshot; it never creates invented trades or cost basis.
- Axis, HDFC, SBI, Kotak, ICICI, Groww, Zerodha and INDmoney are format candidates. Claim support only after redacted fixtures and regression tests.

## 5. User stories

1. As a user, I can sign in on a new browser and recover committed finances.
2. As a user, I can upload a statement and review debits, credits and duplicates before posting.
3. As a user, I can import the same statement twice without duplicate entries.
4. As a cash user, I can record cash spending and see withdrawals counted once.
5. As an investor, I can upload a portfolio screenshot without fabricating trade history.
6. As an FD/bond holder, I can confirm extracted terms and see projected maturity separately from realised income.
7. As a user, I can open a chart segment and inspect contributing records and their sources.
8. As a user, I can export, back up and delete my data and see clear save/backup status.
9. As a later user, I never see another user's records or document metadata.

## 6. MVP scope: complete initial release

The first public release is a **complete usable finance product**, not a UI-only starter. It includes all core areas above, reviewable imports, cloud saves, privacy tests and recovery. Engineering phases in [the plan](06-implementation-plan.md) are sequencing gates, not reduced final scope.

### Features to avoid in version 1

- Bank-password/OTP collection, account scraping, money transfer or trade execution.
- Claims of live bank sync, guaranteed closed-browser backup or unlicensed live market prices.
- Cloud AI processing of private documents without explicit consent and a proven no-fee service.
- Automatic tax filing, personalised investment advice or guaranteed returns.
- Social sharing or shared household vaults without a separate permission design.

## 7. Success metrics and release gates

| Measure | Release target |
| --- | --- |
| Import integrity | No duplicate posting on repeat import; each accepted row has source and review decision. |
| Money correctness | Fixture totals reconcile exactly; transfers are neutral; projections excluded from realised balances. |
| Recovery | Clean-browser sign-in retrieves cloud data; encrypted Drive backup round-trip passes wrong-key and corruption tests. |
| Privacy | Anonymous and second-user reads/writes denied for every financial table/object. |
| Usability | Core tasks work at 360 px and desktop widths; chart values also accessible as text/table. |
| Performance | Useful dashboard content within 3 s on measured representative mobile network and data set. |
| Cost | Required journey stays within monitored free quotas; failures show clearly rather than losing data. |

## 8. Assumptions and unresolved inputs

- Institution priority follows the user's real accounts and supplied **redacted** samples.
- Production Google OAuth setup needs the owner's Google Cloud project. Google Drive consent is separate from login. Neon Auth, Neon Functions and Neon Object Storage provide all application backend capabilities.
- Offline reading can use cache; offline edits require safe replay/conflict handling and visible pending state.
- Free-tier quotas/terms need rechecking before launch. Export and migration must remain possible.
- A public repository never makes a user's cloud records public.

## 9. Official references

- [Neon pricing and free limits](https://neon.com/pricing)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Google Drive app-specific data](https://developers.google.com/workspace/drive/api/guides/appdata)
- [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
