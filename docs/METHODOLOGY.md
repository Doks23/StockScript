# StockScript — Calculation Methodology

A plain-language guide to how every metric on the dashboard is calculated.

---

## Core Concepts

Each **Trade** is for one stock, in one direction (LONG or SHORT). A trade consists of one or more **Transactions** (buy/sell legs).
- **LONG trade:** Buy first, then sell.
- **SHORT trade:** Sell first, then buy back.

Key trade fields: `netPnl` (realized profit/loss), `capitalUsed` (money deployed), `charges` (brokerage + taxes), `closingPrice` (for open trades), `stopLoss`, `status` (OPEN/CLOSED).

---

## Trade Matching — How Raw Transactions Become Trades

Transactions from your broker CSV are grouped into trades using a running net position:
- Start with `netQty = 0`. BUY adds quantity, SELL subtracts it.
- When `netQty` returns to 0, the trade is closed.
- If `netQty` never reaches 0, the trade is still open.

Examples: BUY 100 → SELL 100 = one closed trade. BUY 100 → BUY 50 → SELL 150 = one closed trade (pyramid entry). BUY 200 → SELL 100 → SELL 100 = one closed trade (scale out).

---

## Weighted Prices

When a trade has multiple entries or exits, use weighted averages:
- **Weighted Entry Price** = `sum of (price × quantity for each entry) ÷ total entry quantity`
- **Weighted Exit Price** = same for exits

Example: Buy 100 shares at ₹100 and 50 more at ₹120 →` (100×100 + 50×120) ÷ 150 = ₹106.67`

---

## Realized P&L (Closed Trades)

For closed trades only. Stored as `netPnl`.
- **LONG:** `(exitPrice - entryPrice) × quantity - charges`
- **SHORT:** `(entryPrice - exitPrice) × quantity - charges`

Example: Buy 100 RELIANCE at ₹2,500, sell at ₹2,600, charges ₹200 → (2600-2500)×100 - 200 = ₹9,800 profit.

---

## Open P&L / Mark-to-Market (MTM)

For open or partially closed trades, computed at query time (not stored):
- **Realized portion** (exited shares): same formula as above.
- **Unrealized portion** (still-held shares): uses the EOD `closingPrice` instead of an exit price.
- Total = realized + unrealized - charges.

If you entered 200, exited 100: the 100 exited shares contribute realized P&L, the 100 remaining use the closing price for paper P&L.

---

## Win Rate

`(number of winning trades ÷ total closed trades) × 100`

Only closed trades count. Trades with zero P&L are counted in the total but not as winners.

---

## Profit Factor

`totalProfit ÷ totalLoss` (absolute values)

- > 1.0 = you make more than you lose
- < 1.0 = you lose more than you make
- 2.0 = you make ₹2 for every ₹1 lost

---

## Average Win / Average Loss / Risk-Reward Ratio

- **Average Win** = sum of all winning P&Ls ÷ number of winners
- **Average Loss** = sum of all losing P&Ls (absolute) ÷ number of losers
- **Risk-Reward Ratio** = averageWin ÷ averageLoss

---

## Max Capital Deployed

The peak amount of money you had tied up in trades at any single moment.

For each trade, mark when capital went in (entry) and came out (exit). Walk through time chronologically, tracking the running total. The highest value is your max capital deployed.

---

## Max Drawdown

The largest drop from a peak in your cumulative returns. Measured as a percentage of max capital deployed.

Walk through closed trades in order. Track the running P&L and the peak return seen so far. Drawdown at any point = `peakReturn - currentReturn`. The highest drawdown value is your max drawdown.

---

## Return on Capital

`(total P&L ÷ maxCapitalDeployed) × 100`

Tells you your overall return relative to the peak capital you had at risk.

---

## Portfolio Impact %

`(totalNetPnl ÷ portfolioCapital) × 100`

The most important competition metric. If your portfolio capital is ₹5,00,000 and your P&L is ₹25,000, that's a 5% impact — you grew your portfolio by 5%.

---

## Allocation %

`(capitalInTrade ÷ portfolioCapital) × 100`

What % of your total portfolio is tied up in a given trade.

---

## P&L % (per Trade)

`(tradePnl ÷ capitalUsed) × 100`

The return on just that one trade.

---

## Impact % (per Trade)

`(tradePnl ÷ portfolioCapital) × 100`

How much a single trade affected your total portfolio.

---

## Age (Days in Trade)

`days between first entry and last exit` (or current time if still open).

---

## Stop Loss %

`((stopLossPrice - entryPrice) ÷ entryPrice) × 100`

Negative for LONG (SL below entry), positive for SHORT (SL above entry).

---

## Derived Status (OPEN vs CLOSED)

The database status may be wrong. The system checks: if the remaining open quantity is exactly 0, the trade is treated as CLOSED — otherwise OPEN.

---

## Grouped Trades by Symbol

For the allocation chart, trades are grouped by stock symbol. Per-symbol metrics include total count, total P&L, win rate, and weighted average prices.

---

## Competition Window Filtering

A trade is included in a competition if:
- Its first entry falls within the competition dates, OR
- Its last exit falls within the competition dates, OR
- It was closed (updated) within the competition dates

---

## Leaderboard Scoring & Sorting

Per-trader metrics are aggregated from competition-filtered trades:
- total P&L, capital used, max capital deployed
- return %, portfolio impact %, max drawdown, win rate, total trades, profit factor

**Sort order:** Portfolio Impact (desc) → Max Drawdown (asc) → Win Rate (desc)

---

## Quick Reference: All Formulas

| Metric | Formula |
|--------|---------|
| Weighted Entry Price | `Σ(price × qty) ÷ Σ(qty)` |
| Weighted Exit Price | `Σ(price × qty) ÷ Σ(qty)` |
| Realized P&L (LONG) | `(exit - entry) × qty - charges` |
| Realized P&L (SHORT) | `(entry - exit) × qty - charges` |
| Open P&L (MTM) | `realizedPnl + unrealizedPnl - charges` |
| Win Rate | `(winners ÷ total) × 100` |
| Profit Factor | `grossProfit ÷ grossLoss` |
| Risk-Reward Ratio | `avgWin ÷ avgLoss` |
| Max Capital Deployed | Peak concurrent capital |
| Max Drawdown | Max peak-to-trough return drop |
| Return on Capital | `(totalMtmPnl ÷ maxCapital) × 100` |
| Portfolio Impact % | `(totalNetPnl ÷ portfolioCapital) × 100` |
| Allocation % | `(capital ÷ portfolioCapital) × 100` |
| P&L % (per trade) | `(displayPnl ÷ capital) × 100` |
| Impact % (per trade) | `(displayPnl ÷ portfolioCapital) × 100` |
| Age (days) | `diffInDays(endDate, startDate)` |
| Stop Loss % | `((SL - entry) ÷ entry) × 100` |
| Leaderboard sort | Impact% → Drawdown → WinRate |
| Derived Status | `entryQty - exitQty ≤ 0 → CLOSED` |
| Competition filter | Entry/exit/update within dates |
