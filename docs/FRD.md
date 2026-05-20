# StockScript Journal — Functional Requirements Document

> **Project:** StockScript Journal (stockscript-next)
> **Version:** 0.1.0
> **Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Prisma (PostgreSQL), NextAuth
> **Last Updated:** May 2026

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Authentication & Account Management](#3-authentication--account-management)
4. [Trade Journal](#4-trade-journal)
5. [Dashboard & Analytics](#5-dashboard--analytics)
6. [Competitions](#6-competitions)
7. [Leaderboard](#7-leaderboard)
8. [Admin Panel](#8-admin-panel)
9. [Reports & Exports](#9-reports--exports)
10. [Risk Management](#10-risk-management)
11. [Notifications & PWA](#11-notifications--pwa)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Glossary](#13-glossary)

---

## 1. Introduction

### 1.1 Purpose
StockScript Journal is a web-based trading journal designed for Indian retail traders. It enables users to log, track, and analyse their stock and F&O trades, participate in time-bound competitions, and measure performance against peers on a percentage-return leaderboard.

### 1.2 Scope
The system supports multi-user registration with admin approval, full trade CRUD with multi-leg transactions, competition management, dashboard analytics, CSV import, image uploads, and role-based access control.

### 1.3 Target Audience
- **Traders** — individual retail traders (Equity, Intraday, Options, Futures)
- **Super Traders** — power users with additional privileges
- **Admins** — platform operators managing users and competitions

---

## 2. User Roles & Permissions

### 2.1 Role Hierarchy

| Role | Level | Capabilities |
|------|-------|-------------|
| `TRADER` | 0 | Trade CRUD, dashboard, join competitions, view leaderboard, account settings |
| `SUPER_TRADER` | 1 | All TRADER capabilities + may have additional visibility/privileges |
| `ADMIN` | 2 | All SUPER_TRADER capabilities + approve/reject users, manage roles, manage all competitions, create users, reset passwords, verify emails |

### 2.2 Registration & Approval Flow
1. User registers with name, email, password.
2. System sends email verification link.
3. User verifies email via token.
4. Account remains in `PENDING` approval state.
5. Admin approves or rejects the user.
6. Approved users gain full access. Rejected users cannot log in.

### 2.3 Session Management
- Session-based authentication with server-stored session tokens.
- Sessions expire after a configurable duration.
- Users can have multiple concurrent sessions.

---

## 3. Authentication & Account Management

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-01 | User shall register with name, email, and password | High |
| AUTH-02 | Password must meet complexity rules (min 8 chars, uppercase, lowercase, digit, special char) | High |
| AUTH-03 | Email verification link shall be sent on registration | High |
| AUTH-04 | User shall log in with email and password | High |
| AUTH-05 | User shall reset password via email token | High |
| AUTH-06 | User shall log out, invalidating the session | High |
| AUTH-07 | User shall view and edit their profile (name, bio, avatar) | Medium |
| AUTH-08 | User shall set/update their portfolio capital (default ₹100,000) | High |
| AUTH-09 | Unverified or unapproved users shall be redirected to `/pending-approval` | High |

### 3.2 Data Model (User)
- `id`, `name`, `email` (unique), `passwordHash`, `role`, `approvalStatus`, `isActive`, `portfolioCapital`, `avatarUrl`, `bio`, `approvedBy`

---

## 4. Trade Journal

### 4.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| TRD-01 | User shall create a trade with symbol, segment (EQ/Intraday/Options/Futures), direction (LONG/SHORT), and one or more transactions (BUY/SELL with price, qty, date/time) | High |
| TRD-02 | User shall edit an existing trade including its transactions | High |
| TRD-03 | User shall delete a trade (with confirmation) | High |
| TRD-04 | User shall set trade status to OPEN or CLOSED | High |
| TRD-05 | System shall auto-compute netPnl, capitalUsed, weighted entry/exit prices from transactions | High |
| TRD-06 | User shall add notes, tags, and images to a trade | Medium |
| TRD-07 | User shall view all trades in a searchable, filterable table (by symbol, date range, segment, type, status) | High |
| TRD-08 | User shall import trades via CSV file upload | Medium |
| TRD-09 | User shall bulk-delete selected trades | Medium |
| TRD-10 | User shall merge multiple trades into one | Medium |
| TRD-11 | User shall view trades grouped by stock symbol under `/trades/[symbol]` | Medium |
| TRD-12 | System shall store closingPrice for mark-to-market on open trades | High |
| TRD-13 | User shall auto-fetch closing price when a trade status changes to CLOSED | Low |
| TRD-14 | System shall derive actual status (OPEN/CLOSED) based on entry qty vs exit qty | High |

### 4.2 Trade Matching (Multi-Leg)
- Raw broker transactions are grouped into trades using a running net-position algorithm.
- A trade CLOSES when net quantity reaches zero.
- Supports pyramid entries, scale-outs, and partial closes.

### 4.3 P&L Calculation

| Scenario | Formula |
|----------|---------|
| LONG Closed | `(weightedExit - weightedEntry) × qty - charges` |
| SHORT Closed | `(weightedEntry - weightedExit) × qty - charges` |
| Open (MTM) | `realizedPnl (exited portion) + unrealizedPnl (remaining × closingPrice) - charges` |

### 4.4 Derived Metrics (computed server-side)

| Metric | Formula |
|--------|---------|
| Win Rate | `(winners ÷ total closed trades) × 100` |
| Profit Factor | `grossProfit ÷ grossLoss` |
| Avg Win / Avg Loss | Mean of winning/losing trade P&Ls |
| Risk-Reward Ratio | `avgWin ÷ avgLoss` |
| Max Capital Deployed | Peak concurrent capital across all trades |
| Max Drawdown | Largest peak-to-trough decline in cumulative P&L % |
| Return on Capital | `(totalMtmPnl ÷ maxCapitalDeployed) × 100` |
| Allocation % | `(capitalForTrade ÷ portfolioCapital) × 100` |
| Impact % | `(tradePnl ÷ portfolioCapital) × 100` |
| Age | Days between first entry and last exit (or now if open) |

---

## 5. Dashboard & Analytics

### 5.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| DSH-01 | Dashboard shall display summary metric cards: total trades, open trades, win rate, avg win, avg loss, profit factor, max drawdown, return on capital | High |
| DSH-02 | Dashboard shall display charts (P&L over time, portfolio allocation by symbol, etc.) | High |
| DSH-03 | User shall edit portfolio capital inline on the dashboard | High |
| DSH-04 | Dashboard shall show a daily P&L calendar heatmap (GitHub-style, green/red/gray cells) | Medium |
| DSH-05 | Heatmap shall support year-picker and hover tooltip with date + amount | Medium |
| DSH-06 | Clicking a heatmap day shall navigate to `/trades?from=...&to=...` for that day | Medium |
| DSH-07 | Dashboard metrics shall update in real-time when trades change | High |

---

## 6. Competitions

### 6.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CMP-01 | Admin shall create a competition with name, start date, end date, and visibility (PUBLIC/PRIVATE) | High |
| CMP-02 | Admin shall edit or delete a competition | High |
| CMP-03 | Traders shall browse public competitions and request to join | High |
| CMP-04 | Admin shall approve or reject join requests | High |
| CMP-05 | System shall auto-include all of a participant's trades whose first entry, last exit, or close date falls within competition dates | High |
| CMP-06 | System shall calculate per-trader competition stats: portfolio impact %, return %, max drawdown, win rate, total trades, profit factor | High |
| CMP-07 | Participants' stats shall be cached as `UserCompetitionStat` records and recalculated on page load | Medium |

### 6.2 Competition Filtering Rules
A trade is included in a competition if **any** is true:
- First entry falls between competition start and end date
- Last exit falls between competition start and end date
- Trade was closed (updatedAt) between competition start and end date

### 6.3 Scoring Formula
```
Portfolio Impact % = (Total Net P&L ÷ User's Portfolio Capital) × 100
```
All trades (open + closed) in the competition window contribute:
- Closed trades → realized P&L (`netPnl`)
- Open trades → MTM P&L (using `closingPrice`)

---

## 7. Leaderboard

### 7.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| LDR-01 | Each competition shall have a leaderboard ranking participants by performance | High |
| LDR-02 | Primary sort: Portfolio Impact % (descending) | High |
| LDR-03 | Tie-breaker 1: Lowest Max Drawdown (ascending) | High |
| LDR-04 | Tie-breaker 2: Highest Win Rate (descending) | High |
| LDR-05 | Leaderboard shall display per-user stats: trades count, win rate, profit factor, impact %, return %, drawdown | High |
| LDR-06 | Clicking a user shall navigate to their detailed breakdown at `/leaderboard/[competitionId]/[userId]` | Medium |
| LDR-07 | Leaderboard shall recalculate on every page load (no stale cache) | Medium |

---

## 8. Admin Panel

### 8.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| ADM-01 | Admin shall view a table of all users with role, status, email verification state | High |
| ADM-02 | Admin shall approve or reject pending users | High |
| ADM-03 | Admin shall promote a user to SUPER_TRADER or demote to TRADER | High |
| ADM-04 | Admin shall deactivate or reactivate a user | High |
| ADM-05 | Admin shall reset another user's password | Medium |
| ADM-06 | Admin shall manually verify a user's email | Medium |
| ADM-07 | Admin shall create a new user account directly | Medium |
| ADM-08 | Admin shall manage all competitions (create, edit, delete, add participants) | High |

---

## 9. Reports & Exports

### 9.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RPT-01 | User shall view a Reports page at `/reports` with monthly and quarterly summary tables | Medium |
| RPT-02 | Reports shall include: total trades, win rate, net P&L, Sharpe ratio, max drawdown | Medium |
| RPT-03 | User shall export the current filtered trade list as CSV | Medium |
| RPT-04 | User shall export a report as PDF (client-side generated) | Low |
| RPT-05 | User shall enter a benchmark return % and see "outperformed/underperformed by X%" comparison | Low |

### 9.2 Advanced Analytics Metrics (for Reports & Dashboard)

| Metric | Formula |
|--------|---------|
| Sharpe Ratio | `(avgReturn - riskFreeRate) / stdDevReturns × sqrt(252)` (annualized) |
| Profit Factor | `grossProfit / grossLoss` |
| Expectancy | `(winRate × avgWin) - (lossRate × avgLoss)` |
| Avg Win / Avg Loss Ratio | `avgWin / avgLoss` |
| Max Drawdown % | Largest peak-to-trough decline in equity curve |
| Max Consecutive Losses | Longest streak of losing trades |

---

## 10. Risk Management

### 10.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RSK-01 | User shall access a Position Sizing Calculator at `/risk-calculator` | Medium |
| RSK-02 | Calculator inputs: account balance, risk % per trade, entry price, stop-loss price, segment (EQ/FNO) | Medium |
| RSK-03 | Calculator outputs: recommended quantity, capital at risk (₹), % of account at risk | Medium |
| RSK-04 | FNO mode shall auto-calculate lot size based on segment | Medium |
| RSK-05 | User shall save presets (default risk %, account balance) — persisted per user | Low |
| RSK-06 | Risk Dashboard shall show a running risk-exposure bar: sum of open-trade risk as % of capital, colour-coded (green <5%, amber 5-10%, red >10%) | Medium |
| RSK-07 | Each trade row in the journal shall show a red dot if its risk exceeds the user's preset threshold | Medium |
| RSK-08 | Max drawdown tracker shall be displayed with a "clear" button to reset the peak | Low |

---

## 11. Notifications & PWA

### 11.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| PWA-01 | App shall be installable as a Progressive Web App with service worker | Low |
| PWA-02 | `manifest.json` shall define app name, icons, theme colour (`#0c8f6a`), background colour (`#f5f6f8`) | Low |
| PWA-03 | App shall support offline fallback page for cached routes | Low |
| NOT-01 | App shall support Web Push notifications | Low |
| NOT-02 | Notifications: daily journal reminder, open trade expiry (>7 days), competition deadline (24h before) | Low |
| NOT-03 | User shall opt in/out of notifications via a settings toggle | Low |
| MOB-01 | Mobile trade entry shall use a stripped-down quick-trade form with essential fields only | Medium |
| MOB-02 | Quick-trade form shall use bottom-sheet style on mobile | Medium |
| MOB-03 | Mobile view shall show a floating "+" FAB button to open quick-trade | Medium |

---

## 12. Non-Functional Requirements

### 12.1 Performance
| ID | Requirement |
|----|-------------|
| NFR-01 | Dashboard page shall load in under 3 seconds for a user with 500 trades |
| NFR-02 | Trade CRUD operations shall respond in under 1 second |
| NFR-03 | Leaderboard recalculation shall complete in under 5 seconds for a competition with 50 participants |

### 12.2 Security
| ID | Requirement |
|----|-------------|
| NFR-04 | Passwords shall be hashed (bcrypt or equivalent) |
| NFR-05 | All API routes shall validate session tokens |
| NFR-06 | Role-based access control shall be enforced server-side on all admin/privileged routes |
| NFR-07 | Input validation using Zod schemas on all API endpoints |
| NFR-08 | SQL injection prevention via Prisma parameterised queries |

### 12.3 Usability
| ID | Requirement |
|----|-------------|
| NFR-09 | UI shall be responsive — desktop and mobile breakpoints |
| NFR-10 | App shall render in dark and light themes |
| NFR-11 | All forms shall show inline validation errors |
| NFR-12 | Confirmation dialogs before destructive actions (delete, bulk-delete) |

### 12.4 Reliability
| ID | Requirement |
|----|-------------|
| NFR-13 | CSV import shall handle partial failures gracefully (skip bad rows, report errors) |
| NFR-14 | Auto-fetch closing price shall allow save to proceed even if API fails |
| NFR-15 | Session tokens shall expire; expired sessions shall not grant access |

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **Trade** | A complete round-trip of a stock (entry to exit), which may consist of multiple transactions |
| **Transaction** | A single BUY or SELL leg (part of a trade) |
| **MTM** | Mark-to-Market — unrealised P&L based on closing price for open trades |
| **Segment** | Market segment: EQUITY, INTRADAY, OPTIONS, FUTURES |
| **Portfolio Capital** | User-configured total capital used for %-return calculations |
| **Lot Size** | Fixed contract size for F&O instruments |
| **Sharpe Ratio** | Risk-adjusted return metric (annualized) |
| **Max Drawdown** | Largest peak-to-trough decline in cumulative returns |
| **Profit Factor** | Gross profit divided by gross loss |
| **Expectancy** | Expected P&L per trade: `(winRate × avgWin) - (lossRate × avgLoss)` |
| **PWA** | Progressive Web Application — installable web app with offline support |
| **FAB** | Floating Action Button — a circular button floating above the UI on mobile |
