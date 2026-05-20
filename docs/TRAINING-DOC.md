# 📈 StockScript Journal — Trader Training Guide

## Want to try it right now?

Open the app and log in with this demo account:

| | |
|---|---|
| **Email** | `aarav@stockscript.dev` |
| **Password** | `Trader@123` |

This account has sample trades already loaded so you can explore everything immediately.

---

## 1. What is StockScript?

StockScript is a **trading journal** — a place where you log every trade you take and then see charts and numbers that tell you how you're really doing. Think of it as your personal scoreboard.

It works for: Equity, Intraday, Options, and Futures.

You can enter trades **manually** or **import a CSV** from your broker (Zerodha, Groww, Angel One, Dhan).

---

## 2. Getting Started (Step by Step)

### Step 1 — Create Your Account

Open StockScript and click **"Create trader account"** (top-right).

Enter your name, email, and a password (at least 8 characters).

### Step 2 — Verify Your Email

You'll get a verification email. Click the link inside. Check spam if you don't see it.

### Step 3 — Wait for Admin Approval

After verification, your account is marked **"Pending Approval"**. An admin needs to approve it. This is just a security check — contact them if it takes too long.

### Step 4 — You're In

Once approved, you can log in and start using StockScript. The first thing you should do is set your **Portfolio Capital** on the Account page (the total money you trade with). This makes all your allocation % and impact calculations accurate.

---

## 3. Logging In

![Login screen](/training-screenshots/01-login.png)

Enter your email and password and click **Login**.

After logging in, you'll see the navigation bar at the top. Here's what each link does:

| Page | Use it for... |
|------|-------------|
| **Dashboard** | Your performance overview — charts, numbers, trends |
| **Journal** | Your complete trade list — search, filter, edit |
| **New Trade** | Add a trade (manual form or CSV import) |
| **Leaderboard** | See how you rank in competitions |
| **Account** | Your profile and portfolio capital setting |

---

## 4. Dashboard — Your Performance at a Glance

This is the first screen you see after logging in. It shows all your key numbers and charts in one place.

![Dashboard overview](/training-screenshots/02-dashboard.png)

### Period Filter (top)

Click **Last 10 / 1W / 1M / 3M / All / Custom** to zoom into specific timeframes.

Use the **Hide $** button to temporarily hide amounts (useful when sharing your screen).

### The 6 Metric Cards

| Card | What it tells you |
|------|-------------------|
| Closed Trades | How many trades you've fully completed |
| Open Trades | Trades still running (no exit yet) |
| Win Rate | What % of your closed trades were winners |
| Net Realized P&L | Actual profit/loss from closed trades |
| Total P&L (MTM) | Realized + paper profit/loss on open trades |
| Profit Factor | Gross profit ÷ Gross loss. Above 1.0 = profitable |

### Charts (below the cards)

- **Recent Performance** — Winners vs losers in your last 10 trades
- **Batting Average** — A donut chart of your win/loss ratio
- **Equity Curve** — A line chart of your total P&L over time (going up = good!)
- **Portfolio Allocation** — How your capital is split across open trades
- **Monthly P&L** — Green and red bars showing each month's performance
- **Winners per Month** — How many winning trades you had each month

> 💡 **Tip:** Open trades only show in your equity curve if you enter an **EOD Closing Price** (more on this in the Trade Detail section).

---

## 5. Journal — Your Trade Ledger

Click **Journal** in the navigation to see every trade you've ever logged.

![Journal trade table](/training-screenshots/03-journal.png)

### Filtering Trades

| Filter | How to use it |
|--------|---------------|
| **Search box** | Start typing a symbol name (e.g., "RELIANCE") |
| **From / To** | Pick a date range |
| **Open / Closed / All** | Radio buttons to filter by status |
| **Hide ₹** | Check this to mask amounts |

### Reading the Table

Each row is one trade for a stock. Key columns:

| Column | Meaning |
|--------|---------|
| **L/S** | L = Long (bought first), S = Short (sold first) |
| **Entry** | Your buy-in price, quantity, and date |
| **Exit** | Your sell-out price, quantity, and date |
| **Open Cap ₹** | How much capital you put into this trade |
| **SL %** | Stop loss as % of entry price |
| **Alloc %** | % of your total portfolio in this trade |
| **Age** | Days since you entered (turns amber if >30) |
| **P&L % / ₹** | Profit or loss — both as % and rupees |
| **Impact %** | How this trade affected your total portfolio |
| **EOD** | Click "set" to enter today's closing price (for open trades) |
| **Edit ✏️** | Click the pencil to change trade details |

### Selecting Multiple Trades

Check the boxes on the left side to:
- **Delete** — Remove trades permanently
- **Merge** — Combine two or more trades of the same symbol into one

> 💡 **Tip:** Click any column header to sort by that column (e.g., click "P&L %" to see your best-performing trades first).

---

## 6. Adding a New Trade

Click **New Trade** in the navigation. You'll see a form like this:

![New trade form](/training-screenshots/04-new-trade.png)

### Step 1 — Basic Info (top row)

| Field | What to enter |
|-------|---------------|
| **SYMBOL** | Stock ticker (e.g., RELIANCE) — auto-capitalized |
| **Status** | 🟢 OPEN (still holding) or 🔴 CLOSED (sold) |
| **LONG / SHORT** | Did you buy first? → Long. Sell first? → Short |
| **Segment** | EQUITY / INTRADAY / OPTIONS / FUTURES |
| **Tags** | Labels like `breakout` `swing` `scalp` — useful later for filtering |
| **Competition** | Only if you're in one |

### Step 2 — Entry Transactions (green section)

Fill in each time you bought (or sold, for short trades):
- **Date & Time** of the trade
- **Price** you paid/received
- **Quantity**

Click **"+ Add"** if you entered in multiple parts (scaling in).

### Step 3 — Exit Transactions (amber section)

Only fill this if the trade is **CLOSED**. Same format as entry.
Click **"+ Add"** for partial exits (scaling out).

> ⚠️ Total exit quantity can't be more than total entry quantity.

### Step 4 — Extra Fields (below the transaction grid)

| Field | Why use it |
|-------|-----------|
| **Stop Loss** | Your SL price (for your own tracking — does not auto-execute) |
| **Charges** | Brokerage, STT, GST, etc. |
| **EOD Closing Price** | For open trades — the day's closing price (used for MTM) |
| **Notes** | Why you took the trade, your setup, lessons learned |

### Step 5 — Save

Click **"Log Trade"**. You'll be taken to that symbol's detail page.

---

## 7. Trade Detail View & Chart Screenshots

Click any symbol name in your Journal to open its detail page.

![Trade detail with chart screenshots](/training-screenshots/05-trade-detail.png)

Here you'll see:
- The **status badge** (OPEN / CLOSED) and type (Long / Short / Segment)
- Entry price, exit price, closing price
- When you entered and exited
- Your notes and tags
- Profit/loss breakdown

### Uploading Chart Screenshots

Right on this page, there's an **"Upload chart screenshots"** section:

1. Click **Choose File** and pick your chart images
2. Click **"Attach images"**

These screenshots are private — only you can see them. They're great for reviewing your entries and exits later.

### Setting the EOD Closing Price

On the **Journal** page, open trades have a **"set"** link in the EOD column. Click it, type the day's closing price, and press **Enter**. This updates your unrealized profit/loss (Mark-to-Market).

---

## 8. Leaderboard & Competitions

If your admin has set up competitions, you can join and see how you rank against other traders.

![Leaderboard](/training-screenshots/06-leaderboard.png)

### How to Join

1. Click **Leaderboard** in the navigation
2. Pick a competition from the dropdown
3. Click **"Request to Join"**
4. Wait for admin approval

### How You're Scored

Your trades are automatically included if their entry date falls within the competition window. You don't need to tag anything manually.

The leaderboard ranks traders by:
- **Portfolio Impact %** — (Total P&L ÷ Max capital used) × 100
- **Win Rate** — % of profitable trades
- **Number of Trades**

### What You'll See

- A **podium** with the top 3 traders
- A **full rankings table** below with everyone's score
- Click **"View →"** on any trader to see their full detail

---

## 9. Account Settings

Click **Account** in the navigation.

![Account settings](/training-screenshots/07-account.png)

The most important setting here is **Portfolio Capital**. This is the total amount of money you trade with (e.g., ₹5,00,000).

> ✅ **Set this right away.** Without it, StockScript can't calculate your allocation % or impact %. Every number on the dashboard depends on this.

---

## 10. Quick Tips for Daily Use

### Every Day
- ✅ Set **EOD closing prices** for your open trades so your P&L is accurate
- ✅ Log new trades as soon as you take them (before you forget the details)
- ✅ Review your **Dashboard** to see how you're trending

### Smart Habits
- **Use tags** consistently (`breakout`, `mean-reversion`, `option-selling`) — later you can see which strategy works best
- **Write notes** before entering the trade, not after — it captures your real rationale
- **Upload chart screenshots** right after logging — they're worth a thousand words in your post-trade review

### Fixing Mistakes
- **Wrong entry?** Click the ✏️ pencil on any row to edit
- **Duplicate trades?** Check both boxes and click **"Merge"**
- **Too many trades to enter?** Use the **CSV Import** tab to upload your broker's trade book

---

## Need help?

| Problem | Solution |
|---------|----------|
| Can't log in | Use **"Forgot password?"** on the login screen |
| CSV import fails | Check your file is from one of: Zerodha, Groww, Angel One, Dhan |
| Competition questions | Contact your admin |
| Bugs or suggestions | Tell the development team |

---

## Trying it out?

Remember — you can explore everything with:

| | |
|---|---|
| **Email** | `aarav@stockscript.dev` |
| **Password** | `Trader@123` |

All sample data is pre-loaded so you can click around and see real charts, trades, and numbers.

---

*Happy trading! — The StockScript Team*
