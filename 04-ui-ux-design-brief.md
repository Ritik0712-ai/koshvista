# KoshVista — Website UI/UX Design Brief

**Status:** Website specification. Implementation was subsequently authorised by the user. Vercel is now the active host; Neon remains the sole application backend. See BUILD_STATUS.md for implemented and verified delivery status.

## 1. Design intent

KoshVista should feel like a dependable financial instrument: calm, precise and visually rich. The dashboard is chart-led and data-driven, with clear evidence and freshness labels. Dense information remains readable. The design must work for daily mobile cash entry and deeper desktop analysis. Avoid “bank app” decoration that suggests KoshVista can move money or connect live bank accounts.

## 2. Visual language and tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#F5F7F8` | `#0D1418` | Page background |
| Surface | `#FFFFFF` | `#162126` | Cards/dialogs |
| Ink | `#17252B` | `#EAF2F1` | Main text |
| Muted | `#53666C` | `#ADC0C2` | Secondary text |
| Border | `#D6E0E1` | `#304148` | Rules and input boundaries |
| Primary | `#0C766E` | `#50C7B5` | Focus, selected state, primary action |
| Positive | `#15845B` | `#55D7A0` | Income/positive change |
| Expense | `#C65749` | `#FF8B7A` | Spending/negative change |
| Warning | `#A46812` | `#F4C46E` | Review/stale/projected |
| Information | `#3C6E9F` | `#83B9E7` | Source/help |

Check WCAG 2.2 AA contrast for actual component combinations, including charts and muted text. Color never carries meaning alone; use labels, patterns or icons. Design tokens should map to CSS variables; dark mode follows system by default.

Typography: **Inter** (open source) or system sans for interface; tabular numerals for money. Display 28–36 px desktop / 24–28 px mobile; section 20–24 px; body 14–16 px; data table 13–14 px; labels at least 12 px and never low contrast. INR amounts use Indian grouping (`₹1,23,456.78`) while storing full precision. Align amounts right; show explicit minus signs and currency codes where ambiguity exists.

Spacing: 4 px scale; 8/12/16/24/32 px steps. Card radius 12–16 px; field radius 8–10 px; shadows subtle and unnecessary in dark mode. Motion 120–220 ms and disabled under reduced-motion preference. Focus ring at least 2 px.

## 3. Responsive layout and navigation

| Width | Layout |
| --- | --- |
| 360–599 px | One column, compact header, bottom navigation (Overview, Activity, Add, Wealth, More); horizontal chart scroll only inside chart area; sticky primary action where useful. |
| 600–1023 px | Two-column card grid, collapsible side navigation, filters in sheet. |
| 1024 px+ | Fixed/collapsible left sidebar, utility top bar, 12-column content grid, persistent filters and side detail panel when useful. |

Use max content width around 1440 px. Respect browser zoom to 200% and landscape mobile. Tables may scroll horizontally with sticky identifying column and a card alternative. Side panels become full-screen sheets on phones. Safe-area padding supports mobile PWA. No desktop-only hover action; every chart/row works on tap and keyboard.

## 4. Dashboard structure

1. **Header:** Greeting, date range, account scope, cloud-save badge, Drive-backup badge and Add/Import actions.
2. **Financial snapshot:** Net worth, liquid cash, current-month income, expenses, savings rate; each value has date/source context and navigation.
3. **Primary charts:** Income vs expense grouped bars and net-worth trend line. Tooltips show exact values; chart segment opens contributing rows.
4. **Secondary charts:** Daily-spend histogram, category allocation donut, account balance trend, portfolio allocation and maturity ladder. Layout can reorder by available data.
5. **Action area:** Pending import review, stale valuations, budget alerts and upcoming maturity; source-linked, dismissible.
6. **Recent activity:** Searchable latest entries with account, category, amount, date and source badge.

No fabricated zeros: missing valuation shows “Value unavailable”; no data shows an instructional empty state. Missing documents or partial coverage must be visible in aggregate cards.

## 5. Chart and data-table rules

- Each chart has title, purpose, date range, currency, source/freshness note, legend, units and **View data table**.
- Bars for comparison, lines for time trends, histogram for daily spend distribution, donut for allocation only where labels remain legible; use a ranked bar list instead of an overcrowded donut.
- Use a consistent series order and palette. Transfer amounts are excluded from spending/income charts; projected FD values use dashed lines and a “Projected” legend.
- Tooltips support hover, touch and keyboard focus. Tap/Enter opens the drill-down table with formula, contributing rows and exclusions.
- Date filters offer 7 days, month, quarter, year, custom; account/category chips show active scope and **Clear**. Charts redraw without layout jumps.
- Downloads export the filtered underlying rows; sensitive export reminder appears before download.

## 6. Component specifications

| Component | States and behaviour |
| --- | --- |
| Primary/secondary/destructive button | Default, hover, focus, disabled, loading; destructive requires confirmation; no double-submit. |
| Text/select/date/money input | Label, hint, required marker, validation message; currency shown; money input normalises only on blur to avoid cursor jumps. |
| Account card | Type icon, name, currency, balance, as-of date and status; entire card or explicit View action opens detail. |
| Transaction row | Date, merchant, account, category, signed amount, source/confidence; keyboard actionable and screen-reader label. |
| Chart card | Heading, filters, legend, chart, text summary, table toggle, drill-down and empty/stale/error variants. |
| Review grid | Candidate vs extracted evidence, confidence, duplicate state, accept/edit/skip; bulk actions reveal exact counts. |
| Status badge | Saved/Saving/Failed/Offline/Backup verified/Backup pending with timestamp and help; cloud save and Drive backup never share one badge. |
| Modal/sheet | Focus trap, labelled close, Escape support, preserve unsaved form through recoverable errors. |
| Toast/inline alert | Announces result accessibly; important failure remains visible until acknowledged. |
| Skeleton/empty state | Same dimensions as final content; empty copy offers a concrete next action. |

## 7. Key journeys and microcopy

- **Import:** “Analyse locally” → “Review 42 candidates; 3 need attention” → “Post 39 records.” Never say “AI imported everything” when fields are uncertain.
- **Cash:** “Cash is an account.” Transfer copy: “Move ₹2,000 from HDFC to Cash. This is not an expense.”
- **Portfolio:** “Snapshot as of 1 Oct. Purchase cost unknown until a trade or statement is added.”
- **FD:** “Projected maturity value” beside calculation assumptions; “Recorded payout” only after confirmed entry.
- **Cloud status:** “Saved to cloud at 11:42” vs “Encrypted Drive backup verified yesterday.” If offline: “Changes on this page are not saved yet.”
- **Recovery:** Preview record counts and conflicts before restoring; wrong passphrase never says the archive is corrupt.

## 8. Accessibility, trust and privacy

Meet WCAG 2.2 AA for all critical paths. Use semantic headings, explicit labels, visible focus, 44 px target where practical, reduced-motion support and logical tab order. Every graph has table/text equivalence. Screen readers announce loading and save status. Avoid account numbers in notifications, URLs or page titles. Mask sensitive account hints by default. Explain raw-document retention choice. Do not include third-party trackers or remote font calls in a financial session.

## 9. Visual references and acceptance

Reference familiar financial analytics conventions: information-dense desktop dashboards, mobile banking clarity and editorial whitespace. Use original KoshVista composition and iconography; do not copy another bank/broker brand. The final visual review checks 360 px, 768 px and 1440 px widths in light/dark mode; empty, loading, error, stale, projected and high-data states; keyboard and screen reader; numeric alignment; chart/table parity; and clear distinction between committed, pending and backed-up data.
