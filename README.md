# StockScript Journal

Authenticated trading journal with trader accounts, admin approval, manual-price journals, image uploads, competitions, and a percentage-only leaderboard.

## What changed

- Each trader now owns a personal account with email ID and password
- Registration creates a trader account in pending state
- Email verification is required before admin approval
- Admin approval is required before a trader can enter trades
- One seeded admin account is available for validation workflows
- Trades can be `OPEN` without exit price or exit time
- `closing price` is now the manual end-of-day engine price for journal mark-to-market
- The journal screen follows a denser gold-header layout inspired by the supplied reference
- Leaderboard ranking remains percentage-only and uses all trades inside competition dates

## Local setup

1. Install dependencies

```bash
npm install
```

2. Initialize the SQLite database

```bash
npm run db:init
```

3. Seed demo accounts, trades, and competition data

```bash
npm run db:seed
```

4. Start the app

```bash
npm run dev
```

## Seeded credentials

- Admin:
  - Email: `admin@stockscript.dev`
  - Password: `Admin@12345`
- Approved traders:
  - `aarav@stockscript.dev`
  - `mira@stockscript.dev`
  - `kabir@stockscript.dev`
  - Password for all seeded traders: `Trader@123`
- One additional trader is seeded in pending approval state:
  - `riya@stockscript.dev`
  - Password: `Trader@123`

## Pricing rules

- Closed trades use `exit_price` for realized P&L
- Open trades do not contribute realized P&L
- `closing_price` is the manual end-of-day journal price
- Open-trade mark-to-market uses `closing_price`
- Leaderboard uses all trades (both open and closed) inside competition dates

## 🏆 How Competitions Work

StockScript features an automated competition engine designed to evaluate traders on capital efficiency and risk management over a specific timeframe.

1. **Creation (Admins):** Administrators create a competition by defining a Name, Start Date, End Date, and Visibility (Public/Private).
2. **Joining (Traders):** Traders browse public competitions and click "Request to Join". An Admin must approve this request before the trader officially becomes a participant.
3. **Automatic Trade Tracking:** Traders do not need to manually tag every trade to a competition. The engine automatically evaluates all of a participant's trades. A trade is included in the competition score if:
   - Its first entry falls within the competition dates.
   - _Any_ of its transactions (scaling in/out) fall within the dates.
   - It was closed during the competition window.
4. **Scoring & Leaderboard:** The leaderboard recalculates dynamically:
   - **Net P&L:** Realized profit/loss + Unrealized Mark-to-Market (using manual end-of-day `closing_price`).
   - **Max Capital Deployed:** The highest concurrent capital the trader had tied up in active trades during the window.
   - **Return %:** Calculated as `(Total Net P&L / Max Capital Deployed) * 100`.
   - **Tie-Breakers:** If Return % is identical, the system sorts by Lowest Max Drawdown, then Highest Win Rate.

## Leaderboard formula

- Portfolio Return % = `(Total Net Realized P&L / Max Capital Deployed) * 100`
- Sort order:
  - Highest return %
  - Lowest drawdown
  - Highest win rate

## Storage

- SQLite for local data
- Local upload fallback in `public/uploads`
- Optional S3-compatible upload support via `.env`
