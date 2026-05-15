# Phase 2 — Requirements

## R1 – Advanced Analytics (Core Metrics)

**What:** Add 6 new trading metrics computed from closed trades.

**Details:**
- **Sharpe Ratio** = (avg return − risk-free rate) / std dev of returns, annualized
- **Profit Factor** = gross profit / gross loss
- **Expectancy** = (win rate × avg win) − (loss rate × avg loss)
- **Avg Win / Avg Loss Ratio** = average winning trade P&L ÷ average losing trade P&L
- **Max Drawdown %** = largest peak-to-trough drop in equity curve (use running total P&L)
- **Max Consecutive Losses** = longest streak of losing trades

**Files to touch:**
- `lib/metrics.ts` — new file with pure functions for each metric
- `components/dashboard-charts.tsx` — add a metrics grid below the existing charts
- Optional: `app/api/trades/search/route.ts` — include new metrics in the `/search` response

**Acceptance:**
- 6 numbers display on the dashboard for the logged-in user
- All values update when trades change

---

## R2 – Daily P&L Calendar Heatmap

**What:** A GitHub-style contribution heatmap showing daily P&L.

**Details:**
- One cell per day, color-coded: green shades (profit), red shades (loss), gray (no trades)
- Current year by default, with year-picker
- Aggregates net P&L across all trades closed on that day (using exit time)

**Files to touch:**
- `components/pnl-calendar.tsx` — new component
- `app/dashboard/page.tsx` — add the heatmap section

**Acceptance:**
- Calendar renders 12 months of daily P&L
- Hover tooltip shows date and P&L amount
- Clicking a day links to `/trades?from=...&to=...` with that day's trades

---

## R3 – Reports Page (`/reports`)

**What:** A new top-level page for performance reports.

**Details:**
- Monthly and quarterly summary tables (total trades, win rate, net P&L, Sharpe, max dd)
- Export to PDF button (client-side using `html2canvas` + `jspdf` or similar)
- Export to CSV button — downloads the currently filtered trade list from `/trades`
- Benchmark comparison: user enters a benchmark return %, app compares against own return

**Files to touch:**
- `app/reports/page.tsx` — new page
- `app/reports/layout.tsx` — minimal layout (or reuse root)
- `components/reports-monthly-table.tsx` — new component
- `lib/reports.ts` — new file with aggregation queries
- `components/app-shell.tsx` — add "Reports" to navigation

**Acceptance:**
- Page loads under `/reports`
- PDF download produces a readable report
- CSV download matches the current trade list
- Benchmark input shows "You outperformed by X%" or "You underperformed by X%"

---

## R4 – Position Sizing Calculator

**What:** A tool to calculate recommended trade quantity based on risk parameters.

**Details:**
- Inputs: account balance, risk % per trade, entry price, stop-loss price, segment (EQ/FNO)
- Outputs: recommended quantity, capital at risk (₹), % of account at risk
- FNO: auto-calculates lot size based on segment
- Save presets (default risk %, account balance) per user

**Files to touch:**
- `app/risk-calculator/page.tsx` — new page
- `components/position-sizing-form.tsx` — new component
- `lib/lot-sizes.ts` — lot size lookup table for FNO

**Acceptance:**
- Calculator gives correct qty for both EQ and FNO
- Presets persist per user (saved to User model or local storage)
- Validation: no zero/negative values, max risk ≤ 100%

---

## R5 – Risk Dashboard

**What:** Risk indicators integrated into the existing Journal page.

**Details:**
- Running risk-exposure bar: sum of `(entry price − stop-loss) × qty` across all open trades, displayed as a coloured bar (green < 5% of capital, amber 5–10%, red > 10%)
- Max drawdown tracker: show current drawdown from peak equity, with a "clear" button to reset the peak
- Risk flags on individual trades: if a trade's risk exceeds the user's preset threshold, show a small red dot on the row

**Files to touch:**
- `components/risk-exposure-bar.tsx` — new component
- `components/journal-table.tsx` — add risk dot column
- `components/trades-page-client.tsx` — add risk bar above the filters
- `lib/risk.ts` — new file with risk calculation functions

**Acceptance:**
- Risk bar updates when filters change (only considers visible open trades)
- Max drawdown shown on dashboard or reports page
- Red dot appears on trades exceeding risk threshold

---

## R6 – Auto-Fetch Closing Prices

**What:** Automatically fetch and store closing price when a trade is closed.

**Details:**
- On trade close (status changes to CLOSED), schedule/call a server action that fetches the day's closing price from an external API (e.g., Yahoo Finance, Alpha Vantage, or a free Indian market API)
- Store the fetched price in `trade.closingPrice`
- Show "marked vs actual" P&L comparison on dashboard/reports

**Files to touch:**
- `lib/fetch-closing-price.ts` — new file with API integration
- `components/trade-form.tsx` — trigger fetch on status change to CLOSED
- `lib/trade-utils.ts` — add `getMarkedPnl()` function

**Acceptance:**
- When user changes status to CLOSED and saves, closing price is fetched within a few seconds
- If API fails, show a warning but allow the save to proceed
- P&L attribution shows both realized and marked P&L

---

## R7 – PWA Setup

**What:** Convert the app into a Progressive Web App.

**Details:**
- Install `next-pwa` or `@serwist/next` and configure with service worker
- Generate `public/manifest.json` with app name, icons (use `stockscript-logo.svg` + generated PNG sizes), theme colour (`#0c8f6a`), background colour (`#f5f6f8`)
- Add `<meta name="apple-mobile-web-app-capable">` etc. to layout
- Enable offline fallback page

**Files to touch:**
- `next.config.ts` or `next.config.mjs` — add PWA plugin config
- `public/manifest.json` — new file
- `app/layout.tsx` — add meta tags, manifest link
- `public/sw.js` — generated by plugin

**Acceptance:**
- Chrome shows "Add to Home Screen" prompt
- App opens standalone without browser chrome
- Cached pages load offline

---

## R8 – Mobile-Optimised Trade Entry

**What:** A stripped-down, mobile-first trade form.

**Details:**
- Quick-trade form with only: symbol, direction (L/S), segment, entry price, quantity, date
- All other fields optional (notes, tags, images, charges, closing price)
- Bottom-sheet style on mobile (use a headless UI dialog / sheet)
- Same validation as the full form

**Files to touch:**
- `components/quick-trade-form.tsx` — new component
- `app/trades/new/page.tsx` — show quick form by default on mobile, link to full form
- `components/trades-page-client.tsx` — add floating "+" button on mobile that opens quick form

**Acceptance:**
- Trade can be created in under 15 seconds on mobile
- Quick form validates required fields before submit
- Full form still accessible via a link

---

## R9 – Push Notifications

**What:** Basic push notification support.

**Details:**
- Web push using the Push API + service worker
- Notifications for: daily reminder ("Have you journaled today?"), open trade expiry (trade open > 7 days), competition deadlines (24h before end)
- Opt-in prompt on first visit, toggle in settings

**Files to touch:**
- `app/api/notifications/subscribe/route.ts` — new API endpoint
- `lib/notifications.ts` — helper functions
- `components/notification-toggle.tsx` — new component
- `app/layout.tsx` — register service worker for push

**Acceptance:**
- Browser prompts for notification permission
- Subscribed users receive test notification
- Notifications respect opt-out

---

## Ordering (Suggested)

| Step | Item | Est. Effort |
|------|------|-------------|
| 1 | **R1** – Advanced Analytics Metrics | 2–3 days |
| 2 | **R2** – P&L Calendar Heatmap | 1–2 days |
| 3 | **R7** – PWA Setup | 1 day |
| 4 | **R8** – Mobile Quick-Trade | 2–3 days |
| 5 | **R5** – Risk Dashboard | 2–3 days |
| 6 | **R4** – Position Sizing Calculator | 2 days |
| 7 | **R6** – Auto-Fetch Closing Prices | 2 days |
| 8 | **R3** – Reports Page | 3–4 days |
| 9 | **R9** – Push Notifications | 2 days |
