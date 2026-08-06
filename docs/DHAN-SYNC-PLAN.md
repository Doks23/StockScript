# Dhan Sync — V1 Plan (Equity Only)

**What it does:** replaces "download CSV from Dhan, upload to Journal" with one button.

**Date:** 2026-07-30 · **Status:** plan only, no code written · **Effort:** ~1 day

---

## How it works, in plain terms

1. You click **Sync from Dhan** on the trades page.
2. You paste your Dhan access token (get it from web.dhan.co → My Profile → Access DhanHQ APIs, valid 24 hours).
3. The app checks the token is alive, then looks at your journal and finds the date of your most recent trade.
4. It asks Dhan for every equity fill from **that trade's date** up to **today** (see the note below on why it starts on that date rather than the day after).
5. It throws away any fill it has already saved before.
6. Whatever's left goes through the same trade-building logic your CSV upload already uses.
7. You get the same result card you get today: "12 fills → 3 trades (2 closed, 1 open)".
8. The token is discarded. Nothing is stored.

Nothing runs in the background. It only syncs when you press the button.

---

## Why the start date isn't simply "the day after your last trade"

The duplicate check (next section) is what identifies new trades. The start date is not doing that job — it only decides how much data gets *asked for*. So the only question is: can a real fill ever sit **below** the watermark and still be missing from the journal?

Yes, in three situations:

**1. Same-day fills.** Your last journal trade is 28 Jul at 10:15. You also traded 28 Jul at 14:30. The watermark is a timestamp, but the API takes whole dates. Start from 29 Jul and the afternoon trade is gone forever. So the range must at minimum start **on** the watermark's date, not the day after.

**2. A sync that dies halfway.** This is the real one, and it's caused by your own code, not Dhan. The trade matcher groups fills by symbol, so trades get written to the database **out of date order**. If a sync fails partway, you could have TCS trades written up to 28 Jul while RELIANCE's 20 Jul trades never got saved. The watermark is now 28 Jul, and those RELIANCE fills are permanently skipped.

Fix that properly rather than papering over it: wrap the whole save in one `prisma.$transaction` so a sync either fully lands or writes nothing. Then the watermark can never run ahead of what was actually saved.

**3. Day-boundary errors.** The server thinks in UTC, Dhan thinks in IST, and the timezone bug described below is live in your code today. A one-day pad absorbs off-by-one mistakes while that's still true.

**Recommendation:** start from the watermark's own date, minus a **1-day** pad. Not 3 — I overstated that. Once the save is atomic and the timezone is fixed, even the 1-day pad is only there for cheap insurance: it costs one slightly wider API query and a handful of fills that get discarded before they touch your journal.

> **As built:** no pad. The range starts on the watermark's own date. Case 2 is
> handled properly by the single-transaction save, so the watermark can never
> run ahead of what was written, and anything further back is a genuine gap in
> the journal rather than something the sync can infer — that is what the manual
> from-date override is for.

Amended or late-corrected fills do happen in Indian markets, but they're rare and usually resolved the same day — not a strong enough reason on its own to widen the window.

---

## The one thing that must be built correctly

**Every fill gets tagged with Dhan's own trade ID.**

Right now the CSV import only *warns* about possible duplicates. That's fine for a file you upload once. With a button, pressing it twice would create two copies of every trade — and the start date deliberately re-fetches the watermark day every single time.

So: one new column storing Dhan's `exchangeTradeId`, and the app skips any fill it already has.

Test that proves it works: **sync the same dates twice, the second run creates nothing.**

If duplicates ever do slip in, the bulk-delete you already have is the undo.

---

## Equity only

The app will pull equity fills and skip F&O ones, reporting the count so you know: *"3 F&O fills skipped."*

Reason: options fills for different strikes and expiries would all collapse under one symbol and net into meaningless positions. Not worth solving until you actually journal F&O here.

Equity fills map to segment automatically per trade — delivery becomes EQUITY, intraday becomes INTRADAY. Better than today, where one dropdown tags the whole file.

---

## Two things that get better than CSV

- **Real charges.** Dhan's API returns brokerage, STT, stamp duty, exchange and SEBI charges per fill. Your CSV import currently records charges as zero, so your net P&L is slightly optimistic. This fixes it going forward.
- **Correct segment per trade**, instead of one dropdown for the whole upload.

---

## One existing bug to fix along the way

Dhan sends timestamps as `2025-06-30 09:40:08` with no timezone. The current date parser treats these as *server* time, which on Vercel is UTC — so every trade is recorded 5.5 hours early.

This matters more now, because the sync uses your last trade's date to decide what to pull. Fix: explicitly treat Dhan times as IST. Your existing CSV import very likely has this bug too.

---

## What you'll notice day to day

Swing trades held across two syncs will need manual merging more often than they do today. Today's CSV contains the whole tradebook, so the buy and the sell usually arrive together and pair themselves. With incremental sync, a position bought last month and sold this week arrives as a lone sell.

You said you're fine merging those by hand. Two things make it easier:

- The result card flags them: *"1 sell had no matching buy in this range."*
- You can override the start date and re-pull from the original buy date — the overlap is harmless, and the pair then matches itself automatically.

---

## Build steps

| # | Step |
|---|---|
| 1 | Add `externalTradeId` and `source` columns to `Transaction` (one migration) |
| 2 | New file `lib/brokers/dhan.ts` — call the Dhan API, page through results, convert fills to the format the trade matcher expects, skip F&O |
| 3 | New endpoint `app/api/trades/sync-dhan/route.ts` — work out the date range, fetch, drop duplicates, save **inside a single database transaction** so a failed sync writes nothing |
| 4 | Fix the timezone handling in `lib/csv-parser.ts` |
| 5 | Add a "Sync from Dhan" section to the existing import screen — token box, date range shown with an override, Sync button |

**Small refactor worth doing in step 3:** move the trade-saving block out of the CSV import route into a shared file both routes call. It's a copy-paste of about 80 lines otherwise, and two copies of P&L logic will drift apart.

---

## Before you call it done

1. Pull one month via the API, download the same month's CSV, run both — trade count, symbols and P&L should match. Charges will differ; that's the improvement.
2. Sync the same range twice — second run must create nothing.
3. Check a 9:20am trade shows as 9:20am, not 3:50am.
4. Two trades on the same day, hours apart. Sync after the first, then after the second — the afternoon trade must still get picked up.
5. Force a failure mid-save and confirm the journal is untouched, not half-written.

---

## Technical reference

- Endpoint: `GET https://api.dhan.co/v2/trades/{from-date}/{to-date}/{page}` — paginated, page starts at 0, dates as `YYYY-MM-DD`
- Token check: `GET https://api.dhan.co/v2/profile`
- Header on both: `access-token: {JWT}`
- No static IP whitelisting needed — that only applies to placing orders
- These APIs are free; only Dhan's market-data APIs cost extra
- Rate limits: keep it to ~1 request/second, back off on 429; confirm current limits in Dhan's Annexure

---

## Sources

- [DhanHQ v2 — Statement (Trade History)](https://dhanhq.co/docs/v2/statements/)
- [DhanHQ v2 — Authentication](https://dhanhq.co/docs/v2/authentication/)
- [DhanHQ v2 — Annexure](https://dhanhq.co/docs/v2/annexure/)
