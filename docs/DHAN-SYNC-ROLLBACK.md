# Dhan Sync — What Changed & How To Undo It

Branch: `feat/dhan-sync` (branched off `main` at `4c713c2`, working tree was clean)

---

## Rollback

**Everything, in one go:**

```bash
git checkout main
git branch -D feat/dhan-sync
rm -rf lib/brokers app/api/trades/sync-dhan components/dhan-sync.tsx scripts/test-dhan-sync.ts
npx prisma generate
```

**Just the database columns** (only needed if you already ran a build/`db push`):

```sql
DROP INDEX IF EXISTS "Transaction_externalTradeId_idx";
ALTER TABLE "Transaction"
  DROP COLUMN IF EXISTS "externalTradeId",
  DROP COLUMN IF EXISTS "externalOrderId",
  DROP COLUMN IF EXISTS "source";
```

**Just the synced trades, leaving the code in place:**

```sql
DELETE FROM "Trade" WHERE id IN (
  SELECT DISTINCT "tradeId" FROM "Transaction" WHERE source = 'DHAN_API'
);
```

Every row this feature writes is tagged `source = 'DHAN_API'`, so synced data is always separable from your CSV and manual trades.

---

## Files

**New (4) — delete these and the feature is gone:**

| File | Lines | What |
|---|---|---|
| `lib/brokers/dhan.ts` | 490 | API client, pagination, IST date handling, equity filter, fill → transaction mapper |
| `app/api/trades/sync-dhan/route.ts` | 381 | The endpoint: watermark, dedupe, atomic save |
| `components/dhan-sync.tsx` | 369 | UI panel |
| `scripts/test-dhan-sync.ts` | 252 | Offline tests, no network or DB needed |

**Modified (2) — 13 lines total:**

| File | Change |
|---|---|
| `prisma/schema.prisma` | +6 lines: three nullable/defaulted columns on `Transaction` plus one index |
| `app/trades/new/page.tsx` | +8/−1: renders the sync panel above the existing CSV importer |

**Untouched on purpose:** `lib/csv-parser.ts`, `lib/trade-matcher.ts`, `lib/trade-utils.ts`, `app/api/trades/import/route.ts`, `components/csv-import.tsx`. Your existing CSV import path has not been modified at all, so it cannot regress.

I also skipped the `parseDate` timezone fix in `lib/csv-parser.ts` that the plan mentioned. It's a real bug, but fixing it changes how existing CSV imports behave, and that isn't something to bundle into a change you're already unsure about. The Dhan path does its own IST handling in `lib/brokers/dhan.ts`, so it isn't affected. Worth doing as a separate, deliberate change.

---

## Safety properties built in

| Property | How |
|---|---|
| **Nothing writes without confirmation** | Dry run is the default. The API only writes when the body has `commit: true`. The UI's first button previews. |
| **Repeat clicks can't duplicate** | Each transaction stores Dhan's `exchangeTradeId`; fills already in your journal are filtered out before anything is built. |
| **No half-written syncs** | All trades are created inside one `prisma.$transaction`. Any error rolls the whole thing back. |
| **Fully separable data** | Every synced row is tagged `source = 'DHAN_API'`. |
| **Token never persisted** | Passed in the POST body, used in memory, never stored, logged, or returned. |
| **Additive schema only** | Three nullable/defaulted columns. No existing column or row is altered. |
| **Existing CSV path untouched** | No shared file was modified. |
| **Fails fast on a bad token** | `/v2/profile` is checked before any trade request, so a dead token gives a clear message rather than a 401 mid-pagination. |
| **Fills it can't dedupe are skipped** | A fill with no `exchangeTradeId` is reported, not written. |

---

## Verified

`npx tsx scripts/test-dhan-sync.ts` → **43 assertions, 0 failures.** Covers:

- IST timestamps: `09:40:08` IST resolves to `04:10:08Z` and renders back as 09:40 — this is the 5h30m bug, proven fixed on the Dhan path
- IST calendar day survives the UTC rollover (a 00:30 IST fill stays on the correct date)
- Date chunking is contiguous with no gaps; inverted ranges don't loop
- Equity accepted (NSE_EQ, BSE_EQ, CNC, INTRADAY); options, futures, commodities rejected
- Charges summed across all six components, nulls treated as zero
- Bad fills (zero price, zero quantity, unknown type, no timestamp, no symbol) skipped and reported, not written
- Out-of-order API responses sorted ascending before matching
- End to end through your existing matcher: buy+sell → one CLOSED LONG; pyramid-in then full exit → one closed trade; lone sell → OPEN SHORT (the case that needs manual merging)
- Dedupe: overlapping re-sync yields only new fills; identical re-sync yields nothing

**Not verified, and can't be from here:**

1. **A live Dhan API call.** No token, and the sandbox has no access to `api.dhan.co`. The response shape is built from Dhan's documented schema, and validation is permissive (a field that arrives in an unexpected shape skips that one fill and reports it rather than failing the sync) — but the first real call is the real test.
2. **`prisma generate` / typecheck of the new columns.** The sandbox can't download Prisma's Linux engines. `npx tsc --noEmit` currently shows exactly four errors, all of them "`externalTradeId`/`source` does not exist on Transaction" — they disappear once you run `npx prisma generate` locally. No other type errors anywhere.

---

## First run

```bash
npx prisma generate          # picks up the new columns, clears the 4 type errors
npx tsc --noEmit             # should be clean
npx tsx scripts/test-dhan-sync.ts   # 43 passed
npm run dev
```

Then: Trades → New → Import tab → **Sync from Dhan**.

1. Paste a token from web.dhan.co → My Profile → Access DhanHQ APIs.
2. Set the date range by hand for the first run — pick a **short window you can verify manually**, say one week where you know exactly what you traded. Don't start with 90 days.
3. Hit **Preview sync**. Nothing is written. Check the table: symbols, buy/sell, quantities, dates, and that the times look like IST market hours (09:15–15:30), not early morning.
4. If it looks right, hit **Import**.
5. Press **Preview sync** again on the same range. It should report `0` new fills. That's the proof the dedupe works — worth doing once before you trust the button.

Note that `npm run build` runs `prisma db push`, so deploying applies the columns automatically. Nothing to run by hand on the database.

---

## Known behaviour, not a bug

A position bought before your last sync and sold after it arrives as a lone sell, which the matcher classifies as a new OPEN SHORT. The preview flags this explicitly:

> *N sell(s) had no matching buy in this date range (SYMBOL). These came through as new SHORT trades.*

Two ways out, as agreed: merge them in the journal, or re-run with the start date set back to the original buy date — the overlap is harmless because of dedupe, and the pair then matches itself.
