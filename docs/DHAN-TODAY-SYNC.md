# Dhan Today Sync — same-day fills

**What it does:** puts today's executed orders in the journal while the market is
still open, instead of waiting for the end-of-day statement.

**Date:** 2026-08-10 · **Status:** built · **Scope:** equity only

---

## Why it is separate from the existing Dhan sync

They read different APIs, and the difference is the whole point.

| | Existing sync (`/api/trades/sync-dhan`) | Today sync (`/api/trades/sync-today`) |
|---|---|---|
| Endpoint | `GET /v2/trades/{from}/{to}/{page}` (statement) | `GET /v2/trades` (day trade book) |
| Available | End of day, late | The moment an order fills |
| Charges | Yes | **No** |
| Symbol field | Company name — `DECCAN GOLD MINES` | Exchange ticker — `DECNGOLD` |
| Sells with no buy in range | New SHORT trade + "go merge it" | Attached to the open position |
| Row tag | `source = DHAN_API` | `source = DHAN_TODAY` |

Nothing in `lib/brokers/dhan.ts` or the EOD route was changed. The new path
imports exactly one thing from the old one — `contentFingerprint` — and that is
deliberate (see below).

---

## The symbol mapping

The live APIs say `DECNGOLD`. The journal says `DECCAN GOLD MINES`, because that
is what the statement API returns and therefore what every existing row uses.
The two names only meet in Dhan's published scrip master:

```
https://images.dhan.co/api-data/api-scrip-master.csv

SEM_SMST_SECURITY_ID  762638
SEM_TRADING_SYMBOL    DECNGOLD                ← live APIs, and TradingView
SEM_CUSTOM_SYMBOL     Deccan Gold Mines       ← journal symbol, uppercased
SM_SYMBOL_NAME        DECCAN GOLD MINES LTD.  ← display only
```

Uppercased `SEM_CUSTOM_SYMBOL` is the journal convention exactly. It was checked
against every Dhan-sourced symbol in the journal before this was built — Sky Gold
And Diamonds, RR Kabel, Alkyl Amines Chemicals, Ather Energy and the rest all
match with no massaging.

Lookup is by `securityId` first and ticker second, because a ticker gets
reassigned when a company renames and a security id does not.

The file is 26MB of every instrument Dhan lists. `lib/brokers/dhan-scrip-master.ts`
keeps only cash equity (~23k rows, ~60ms to parse) and caches the result in the
module for 12 hours, so a warm server downloads it at most twice a day.

**If a symbol is missing from the master** the fill is journalled under its raw
ticker and reported in the preview. That row will *not* line up with the same
company's existing journal rows, so it is worth checking before importing.

---

## Why this matters beyond cosmetics

Both syncs identify a fill by the same content fingerprint:

```
dhan:v1:{journal symbol}:{exchange time ms}:{side}:{price}:{qty}:{occurrence}
```

The statement API returns the literal `"0"` in `exchangeTradeId`, so the EOD sync
always falls back to this fingerprint. The trade book *does* return a real trade
id — and this sync deliberately throws it away, because storing it would leave
tomorrow's EOD sync computing a fingerprint that matches nothing and importing
every fill a second time.

Verified: the same fill, mapped through both modules, produces byte-identical
keys. Get the symbol mapping wrong and this property silently breaks.

---

## Fills attach to the open position

Selling 100 of a 238-share holding is a scale-out, not a new short. The sync
finds the open trade for that symbol and segment, runs the existing matcher over
*old legs + today's fills together*, and rewrites the trade from the result.

Running the matcher over the whole position — rather than appending and
recomputing — is what makes these cases correct:

- **Scale out to flat** → one trade, now CLOSED.
- **Pyramid in** → one trade, larger, still OPEN.
- **Close and re-enter the same day** → two trades, with the old legs staying in
  the first. An append would have produced one trade with a zero crossing in the
  middle, which is not a thing.
- **A fill reported late, timestamped before a stored leg** → lands in its right
  chronological slot. This is why an attached trade's legs are deleted and
  recreated rather than appended: `order` is positional across the whole trade.

Attach is skipped, with a warning, when the open trade is **locked**, or when the
symbol has more than one open trade (it takes the oldest and says so).

`capitalUsed` is recomputed only when the stored figure was the one this app
derived. A hand-set value is left alone and reported.

---

## Charges

The day trade book has no brokerage, STT, stamp duty, GST or exchange charges.
Rows land with `charges = 0` and `source = DHAN_TODAY`.

`POST /api/trades/sync-today/charges` reconciles them once Dhan publishes the
statement, usually the next morning:

1. Pulls the statement for that day.
2. Pairs each statement fill with the journal row by symbol, side, price and qty.
3. Adds the charges to the trade and recomputes `netPnl`.
4. Rewrites the row's `externalTradeId` to the **statement's** fingerprint and
   re-tags it `DHAN_API`.

Step 4 is the safety net: if the two APIs ever disagree on a timestamp to the
second, this is what stops the EOD sync importing a duplicate. Re-running is
harmless — no `DHAN_TODAY` rows are left for that day, so no charge is ever
added twice.

Until you run it, that day's P&L is gross of costs. On a typical day that is
tens of rupees per trade.

---

## Rollback

**Not a single delete, unlike the EOD sync.** This one modifies trades you
already had, so "delete everything it wrote" is not sufficient:

- Trades it **created** (`source = DHAN_TODAY` on every leg) can be deleted
  outright.
- Trades it **attached to** need the `DHAN_TODAY` legs deleted and the trade's
  `status`, `netPnl`, `capitalUsed` and `lockedAt` recomputed from what remains.

Preview before every import — it is the default, and it names every trade it
would touch and whether it would update or create.

---

## Not covered

- **F&O.** Skipped and counted, same as the EOD sync.
- **Amended or corrected fills.** If Dhan restates a price after the fact, the
  fingerprint changes and the charges backfill reports it as an unmatched
  statement fill rather than fixing it.
- **Orders that filled but never reached the trade book.** The order book counts
  are shown in the preview so a gap is visible.
