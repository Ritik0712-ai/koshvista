# KoshVista — Complete Website Flow

**Status:** Website specification. Implementation was subsequently authorised by the user. Vercel is now the active host; Neon remains the sole application backend. See BUILD_STATUS.md for implemented and verified delivery status.

## 1. Navigation and global behaviour

- Public routes: `/` overview/privacy, `/login`, `/signup`, `/sign-in-help`, `/auth/callback`. Initial release uses Google sign-in through Neon Managed Better Auth; email/password is contingent on a verified no-fee production mail path.
- Authenticated shell: `/app` Overview; Activity; Accounts; Cash; Budgets; Imports; Wealth; Fixed Income; Liabilities; Analytics; Insights; Settings. Desktop uses a left sidebar and top utility bar. Mobile uses a compact header and bottom primary navigation (Overview, Activity, Add, Wealth, More). More opens the full section list. Every view preserves browser Back/Forward and direct links.
- A global **Add** menu offers Expense, Income, Transfer, Cash expense, Trade, FD/Bond, Liability and Import. Search opens command/search results; notification icon opens Insights/Reminders; profile opens Settings/Sign out.
- Auth gate sends unauthenticated visitors to `/login?next=...` and returns after successful login. Expired session pauses edits and prompts reauthentication without claiming a save.
- Global status bar: `Saved to cloud` with time, `Saving`, `Offline—changes not saved`, `Save failed—retry`; separately `Drive backup verified`, `Backup pending`, `Backup failed`, `Drive not connected`. Never merge these statuses.
- All destructive actions use a confirmation dialog naming scope and reversibility. Success shows an accessible toast and updated view. Validation errors appear beside fields; network errors preserve inputs and offer Retry. Empty views explain the next useful action. Skeletons indicate loading, with no fake values.
- Every chart has date/account/category filters, hover/tap tooltip, a drill-down action, downloadable CSV and a data-table alternative. `No data` and `partial/stale valuation` are explicit.

## 2. Public entry, identity and recovery

| ID / route | Content and user actions | Success | Error / empty |
| --- | --- | --- | --- |
| W01 `/` | Explain product, data privacy and source link. **Open app** goes to `/app` if signed in, otherwise `/login`; **Create account** → `/signup`. | Route loads without financial data. | Service unavailable: show static copy and retry link. |
| W02 `/signup` | Explain account privacy and terms; **Continue with Google** starts Neon Auth OAuth; **Sign in** → W03. No app password is collected. | Authenticated onboarding. | OAuth cancelled, rate limit or provider unavailable: clear retry; no partial account record. |
| W03 `/login` | **Continue with Google**, **Sign-in help** → W04, **Create account** → W02. | Return to `next` or W07. | OAuth failure, wrong Google account, expired session or provider unavailable; no account existence leakage. |
| W04 `/sign-in-help` | Explain Google-account recovery and switching accounts; **Try again** → W03, **Contact support** opens published support route. | User returns to login with context preserved. | Help page remains available if auth provider is down. |
| W05 `/auth/callback` | Validate OAuth/email callback; spinner with **Cancel**. | W06 onboarding or requested authenticated route. | Invalid state/code gives safe retry login, no token in URL after processing. |
| W06 `/app/welcome` | First-run currency INR, locale/date, privacy choices and optional Drive connection. **Continue** creates profile and first cash account; **Connect Drive** opens W40; **Skip for now** clearly marks backup unconfigured. | W07. | Profile creation failure stays on page; no duplicate first-run accounts. |
| W07 `/app` | Dashboard header, date range, account selector, net worth, available cash, spending, income, savings rate; charts and recent activity. Cards open W08/W10/W15/W19/W26. **Import** → W21; **Add** global menu. | Filters refresh all relevant measures and source/staleness badges. | First use: guided Add account/Import/Cash; partial data labels; fetch error Retry. |

## 3. Accounts, cash, ledger and budgets

| ID / route | Content and user actions | Success | Error / empty |
| --- | --- | --- | --- |
| W08 `/app/accounts` | Account cards by type with balances, currency, sync/source dates; **Add account** → W09; tap card → W10; filter type. | Accurate totals by currency, no invalid cross-currency sum. | No accounts: Add bank/cash; fetch error Retry. |
| W09 `/app/accounts/new` or `/:id/edit` | Type, name, currency, institution, opening amount/date, optional masked account hint; **Save**, **Cancel**, **Archive** (edit only). | Account created/updated then W10. | Duplicate hint warning, invalid opening date/amount; archived account with history remains in reports. |
| W10 `/app/accounts/:id` | Balance chart, entries, reconciliation marker, **Add transaction**, **Transfer**, **Edit**, **Reconcile**, **Archive**. Entry tap → W13. | Actions update balance and history. | No entries: import/add; missing/foreign account → safe Not found. |
| W11 `/app/cash` | Cash account balance, cash in/out bars and entries; **Cash expense**, **Cash income**, **Transfer to/from bank**, **Adjust balance**. | All actions post ledger records; transfer neutral in spending. | No cash account: **Create cash account**; discrepancy prompts reconciliation. |
| W12 `/app/activity` | Search, range, amount, type, category, account, source and review filters; list/table, **Add**, **Import**, **Export CSV**; row → W13. | Filter chips and totals update together. | Empty filter: Clear filters; network error Retry; no activity: Add/import. |
| W13 `/app/activity/:id` | Date, signed amount, account, category, splits, source, audit history; **Edit** → W14, **Delete** confirmation, **Open source** → W25. | Updated/deleted record and derived charts recalculate. | Transfer deletion explains both legs; source missing says unavailable; foreign ID → Not found. |
| W14 `/app/activity/new` or `/:id/edit` | Expense/income/refund, account, amount/currency, date/time, merchant, category, note, split rows, source; **Save**, **Save and add another**, **Cancel**. | Atomic posted record; split sum equals amount. | Field errors inline; offline/failed save preserves draft; no account links W09. |
| W15 `/app/transfers/new` | From/to distinct accounts, amount, date, optional fee and note; **Transfer**, **Cancel**. Fee is separate expense. | Paired legs linked and spending unchanged except fee. | Same-account, insufficient data, currency conversion without rate, save failure. |
| W16 `/app/budgets` | Period selector, budget versus actual chart, category cards; **Add budget** → W17, recurring tab → W18. | Variance uses posted expenses and excludes transfers. | No budgets: create; partial-period badge; fetch error Retry. |
| W17 `/app/budgets/new` or `/:id/edit` | Category, amount, currency, period, start/end, carryover choice; **Save**, **Delete**, **Cancel**. | Budget card and chart updated. | Duplicate category/period conflict; invalid range. |
| W18 `/app/recurring` | Detected suggestions and confirmed rules; **Confirm**, **Dismiss**, **Edit rule**, **Pause**, **Delete**. | Rule/reminder saved; no financial transaction posted until separately confirmed/imported. | No suggestions: explanation; rule conflict/error shown. |

## 4. Import and review

| ID / route | Content and user actions | Success | Error / empty |
| --- | --- | --- | --- |
| W19 `/app/imports` | Import history with status/record counts/source; **Upload document** → W20; history row → W25. | Last successful import and pending review visible. | No imports: choose CSV/PDF/image; fetch error Retry. |
| W20 `/app/imports/new` | Select document type (bank/broker/FD/bond), account/institution, file picker/drop zone; **Analyse**, **Cancel**. Local extraction progress, page count and **Stop**. | W21 review queue; encrypted/raw upload retention choice shown. | Unsupported/oversized/password-protected/corrupt file: explain and offer retry/manual entry; no upload on failure. |
| W21 `/app/imports/:job/review` | Candidate grid, evidence preview, confidence badges, duplicate/conflict reasons; row **Accept**, **Edit**, **Skip**, bulk select; **Post accepted** and **Save review for later**. | Atomic posting; W22 receipt with imported/skipped/duplicate counts. | Unresolved low-confidence rows block their posting; partial save retains decisions; stale job reloads. |
| W22 `/app/imports/:job/result` | Receipt, counts, warning list; **View activity**, **View holdings/FDs**, **Review remaining**, **Download report**. | Links land on created records. | Zero posted explains why; retry failed batch without duplication. |
| W23 `/app/imports/:job/duplicates` | Side-by-side candidate/existing row/source; **Keep existing**, **Replace with reviewed**, **Keep both** with reason. | Choice audited and counts refreshed. | Unsafe match stays unresolved; source unavailable is labelled. |
| W24 `/app/imports/manual` | Manual document-derived entry when OCR fails; source upload optional; **Save draft**, **Post**. | Same validation/provenance as imported row. | Missing required fields; failed save preserves draft. |
| W25 `/app/imports/:job/source` | Source metadata, secure preview if retained, extracted text highlight and parser version; **Download original** if retained, **Delete original**, **Back to result**. | Financial records remain after original deletion with provenance metadata. | No retained original: state this plainly; foreign job → Not found. |

## 5. Wealth, fixed income and liabilities

| ID / route | Content and user actions | Success | Error / empty |
| --- | --- | --- | --- |
| W26 `/app/wealth` | Total invested/valued, allocation donut, value trend, holdings table and stale-price badges; **Add instrument**, **Add trade**, **Record snapshot**, holding → W27. | Metrics distinguish documented cost from snapshot-only value. | No holdings: import/add; missing valuation: N/A, not zero. |
| W27 `/app/wealth/:id` | Instrument detail, trades, lots when known, snapshots, valuation history and sources; **Edit**, **Add trade**, **Record valuation**. | Recompute documented cost/return. | Snapshot-only displays unknown cost/return; foreign ID → Not found. |
| W28 `/app/wealth/trades/new` | Buy/sell/dividend/fee, instrument, account, quantity, price, currency, date, source; **Save**, **Cancel**. | Trade and ledger cash effect linked once. | Sell beyond known holdings requires explicit correction; invalid precision/rate blocked. |
| W29 `/app/wealth/snapshots/new` | Date, broker, instrument rows, quantities/values, source; **Save**. | Dated observation added without trade creation. | Incomplete rows held; duplicate snapshot warns. |
| W30 `/app/fixed-income` | FD/bond cards, maturity ladder, projected/realised toggle; **Add FD/Bond**, card → W31. | Projection labels and reminder counts visible. | No contracts: add/import; expired terms need review. |
| W31 `/app/fixed-income/new` or `/:id` | Type, issuer, principal, currency, start/maturity, interest/coupon, compounding, payout, linked account, source; **Save**, **Edit**, **Record actual payout**, **Close**. | Schedule recomputed; actual payout becomes posted ledger record only after confirmation. | Impossible dates/rates, missing evidence, duplicate contract and schedule errors shown. |
| W32 `/app/liabilities` | Liability cards, balance trend and net-worth impact; **Add liability** → W33; card opens detail. | Payments reduce liability and linked cash once. | No liabilities: explanatory state; missing statement date labelled. |
| W33 `/app/liabilities/new` or `/:id` | Creditor, type, balance, currency, rate, due date, payment schedule, account; **Save**, **Record payment**, **Edit**, **Close**. | Payment posts linked ledger and updated balance. | Overpayment/invalid terms/failed save retained for correction. |

## 6. Analytics, insights and settings

| ID / route | Content and user actions | Success | Error / empty |
| --- | --- | --- | --- |
| W34 `/app/analytics` | Tabs Spending, Cash Flow, Net Worth, Portfolio, Cash, Maturities; date/account/category filters, chart/table toggle, **Export**; segment → W35. | Filters, totals and charts stay consistent. | Insufficient data explains prerequisites; stale values flagged. |
| W35 `/app/analytics/drilldown` | Contributing rows, formula, excluded transfers/projections and source links; **Open transaction**, **Back**. | Evidence trace complete. | Missing source clearly labelled; invalid filter returns safe empty. |
| W36 `/app/insights` | Source-linked anomalies, recurring suggestions, budget alerts and maturity reminders; **Review**, **Dismiss**, **Snooze**. | Decisions persisted, no silent ledger changes. | No insights: calm empty state; low-confidence reason shown. |
| W37 `/app/settings` | Profile, Security, Backup, Categories, Appearance, Export, Privacy/Delete, About links; sign-out. | Selected route loads. | Failed settings fetch Retry. |
| W38 `/app/settings/profile` | Display name, Google-linked email (read-only), currency/locale and timezone; **Save**, **Sign out**. | Updated profile. | Validation errors; Google email changes are handled by Google and refreshed on next sign-in. |
| W39 `/app/settings/security` | Active session details if exposed by Neon Auth, **Sign out**, **Sign out other sessions** only if supported; recovery guidance. | Session state refreshed. | Reauth required for sensitive change; unsupported session management is hidden rather than simulated. Managed MFA is not claimed. |
| W40 `/app/settings/backup` | Cloud save time and Drive backup time separately; **Connect Drive**, **Back up now**, **Restore**, **Download encrypted backup**, **Disconnect Drive**. | Consent → verified backup; restore wizard W41. | No Drive consent, quota, offline, wrong account, token expiry, closed-tab limitation explained. |
| W41 `/app/settings/restore` | Select Drive archive/manual file, enter recovery passphrase, **Verify**, preview counts/conflicts, **Restore to empty vault** or **Merge reviewed**, **Cancel**. | Integrity verified, atomic restore and reconciliation report. | Wrong key/corrupt/schema mismatch never changes live records; retry safe. |
| W42 `/app/settings/categories` | Category tree and categorisation rules; **Add**, **Rename**, **Merge**, **Delete rule**, **Restore default**. | Existing records remapped with preview. | Protected/default category, cycle and invalid merge blocked. |
| W43 `/app/settings/appearance` | Light/dark/system, density, chart palette, number/date formats; **Save**. | Preview updates, preference persists. | Accessibility contrast warning; save error keeps prior value. |
| W44 `/app/settings/export` | Data scope/date, CSV/JSON, optional encrypted archive; **Generate**, **Download**. | Browser download with sensitive-file reminder. | Empty selection, generation error and expired link handled. |
| W45 `/app/settings/privacy` | Retained documents, Drive consent, data deletion; **Delete source**, **Delete all data**, **Delete account** with reauthentication and typed confirmation. | Removal receipt and sign-out on account deletion. | Partial provider failure reports what remains; no false completion. |
| W46 `/app/settings/about` | Version, open-source licence/repository, support/security contact and service status links. | External links open safely. | Link failure does not expose data. |

## 7. End-to-end paths and global state matrix

- **First use:** W01 → W02/W03 → W05 → W06 → W07 → W09 → W20 → W21 → W22 → W34.
- **Cash:** W07 Add → W11 → W14 cash expense; W10 bank → W15 transfer → W11 cash balance, spending unchanged.
- **Portfolio screenshot:** W19 → W20 broker image → W21 → W22 → W26 snapshot; cost stays unknown.
- **FD PDF:** W20 → W21 confirm terms → W31 schedule → W36 maturity reminder; projected cash flow stays separate.
- **New device:** W03 sign-in → W07 cloud records. If primary records are missing, W40 → W41 encrypted Drive restore.
- **Offline:** Previously cached read views show `Offline/stale`; unsaved draft remains local and is never counted in committed totals. Online return offers explicit retry and conflict review.

Every route must handle: initial loading; empty data; no matching filter; transient network failure; expired session; permission denial; and stale/conflicting mutation. Financial values always display currency, sign, date range and whether posted, projected or snapshot. Buttons have disabled/loading states and cannot submit twice. Dialog focus returns to the initiating control. Keyboard, screen reader and touch users can perform every essential action.
