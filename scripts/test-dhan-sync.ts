/**
 * Offline checks for the Dhan sync mapper. No network, no database.
 * Run: npx tsx scripts/test-dhan-sync.ts
 *
 * The fixture mirrors the real June 2025 fills already used in
 * test-dhan-import.js, so the API path can be compared against the CSV path.
 */

import {
  chunkDateRange,
  fillCharges,
  isEquityFill,
  mapDhanFills,
  parseIstTimestamp,
  shiftDateString,
  toIstDateString,
  type DhanFill,
} from "../lib/brokers/dhan";
import { buildTradesFromTransactions } from "../lib/trade-matcher";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}\n        expected ${b}\n        actual   ${a}`);
  }
}

function fill(overrides: Partial<DhanFill> = {}): DhanFill {
  return {
    orderId: "112111182198",
    exchangeTradeId: "70062043",
    transactionType: "BUY",
    exchangeSegment: "NSE_EQ",
    productType: "CNC",
    tradingSymbol: null,
    customSymbol: "HPL Electric & Power",
    securityId: "3456",
    isin: "INE155A01022",
    instrument: "EQUITY",
    tradedQuantity: 150,
    tradedPrice: 556,
    exchangeTime: "2025-06-30 09:40:08",
    createTime: "NA",
    updateTime: "NA",
    sebiTax: 0.0004,
    stt: 0,
    brokerageCharges: 0,
    serviceTax: 0.0025,
    exchangeTransactionCharges: 0.0135,
    stampDuty: 0,
    drvOptionType: "NA",
    drvExpiryDate: "NA",
    drvStrikePrice: 0,
    ...overrides,
  };
}

console.log("\n1. IST timestamp handling (the 5h30m bug)");
{
  const parsed = parseIstTimestamp("2025-06-30 09:40:08");
  // 09:40:08 IST == 04:10:08 UTC
  check("naive IST string parsed as IST", parsed?.toISOString(), "2025-06-30T04:10:08.000Z");
  check(
    "renders back as 09:40 in IST",
    parsed
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
        }).format(parsed)
      : null,
    "09:40",
  );
  check("explicit offset respected", parseIstTimestamp("2025-06-30T09:40:08+05:30")?.toISOString(), "2025-06-30T04:10:08.000Z");
  check('"NA" returns null', parseIstTimestamp("NA"), null);
  check("empty returns null", parseIstTimestamp(""), null);
  check("garbage returns null", parseIstTimestamp("not a date"), null);

  // A 00:30 IST timestamp is the previous day in UTC. The date string used for
  // the API range must stay on the IST calendar day.
  const lateNight = parseIstTimestamp("2025-06-30 00:30:00");
  check("IST date string survives UTC day rollover", lateNight ? toIstDateString(lateNight) : null, "2025-06-30");
}

console.log("\n2. Date range helpers");
{
  check("shift back one day", shiftDateString("2025-07-01", -1), "2025-06-30");
  check("shift across month", shiftDateString("2025-03-01", -1), "2025-02-28");
  check("single window for short range", chunkDateRange("2025-06-01", "2025-06-30").length, 1);
  const chunks = chunkDateRange("2025-01-01", "2025-07-30");
  check("long range chunked", chunks.length, 3);
  check("chunks start at range start", chunks[0].from, "2025-01-01");
  check("chunks end at range end", chunks[chunks.length - 1].to, "2025-07-30");
  check(
    "chunks are contiguous, no gaps",
    chunks.every((chunk, index) => index === 0 || shiftDateString(chunks[index - 1].to, 1) === chunk.from),
    true,
  );
  check("inverted range does not loop", chunkDateRange("2025-07-30", "2025-01-01").length, 1);
}

console.log("\n3. Equity-only filter");
{
  check("plain equity accepted", isEquityFill(fill()), true);
  check("intraday equity accepted", isEquityFill(fill({ productType: "INTRADAY" })), true);
  check(
    "option rejected",
    isEquityFill(
      fill({
        instrument: "DERIVATIVES",
        exchangeSegment: "NSE_FNO",
        drvOptionType: "CALL",
        drvStrikePrice: 25000,
      }),
    ),
    false,
  );
  check(
    "future rejected",
    isEquityFill(fill({ instrument: "DERIVATIVES", exchangeSegment: "NSE_FNO" })),
    false,
  );
  check("commodity rejected", isEquityFill(fill({ exchangeSegment: "MCX_COMM" })), false);
  check("BSE equity accepted", isEquityFill(fill({ exchangeSegment: "BSE_EQ" })), true);
}

console.log("\n4. Charges");
{
  check(
    "all components summed",
    Number(fillCharges(fill()).toFixed(4)),
    0.0164,
  );
  check("nulls treated as zero", fillCharges(fill({ stt: null, sebiTax: null, serviceTax: null, exchangeTransactionCharges: null, brokerageCharges: null, stampDuty: null })), 0);
  check(
    "realistic charges",
    Number(fillCharges(fill({ stt: 83.4, brokerageCharges: 20, serviceTax: 3.6, exchangeTransactionCharges: 2.5, sebiTax: 0.08, stampDuty: 12.5 })).toFixed(2)),
    122.08,
  );
}

console.log("\n5. Mapping and skip behaviour");
{
  const result = mapDhanFills([
    fill(),
    fill({ exchangeTradeId: "70062044", instrument: "DERIVATIVES", exchangeSegment: "NSE_FNO", drvOptionType: "PUT", drvStrikePrice: 25000 }),
    fill({ exchangeTradeId: "70062045", tradedPrice: 0 }),
    fill({ exchangeTradeId: "70062046", tradedQuantity: 0 }),
    fill({ exchangeTradeId: "70062047", transactionType: "SHORTSELL" }),
    fill({ exchangeTradeId: "70062048", exchangeTime: "NA", updateTime: "NA", createTime: "NA" }),
    fill({ exchangeTradeId: "70062049", customSymbol: null, tradingSymbol: null }),
  ]);

  check("one good fill mapped", result.mapped.length, 1);
  check("one F&O fill counted as skipped", result.skippedNonEquity, 1);
  check("five bad fills reported", result.errors.length, 5);
  check("symbol uppercased like the CSV path", result.mapped[0].transaction.ticker, "HPL ELECTRIC & POWER");
  check("segment derived as EQUITY for CNC", result.mapped[0].segment, "EQUITY");
  check("dedupe id carried through", result.mapped[0].externalTradeId, "70062043");
  check(
    "intraday product maps to INTRADAY segment",
    mapDhanFills([fill({ productType: "INTRADAY" })]).mapped[0].segment,
    "INTRADAY",
  );
  check(
    "tradingSymbol preferred over customSymbol",
    mapDhanFills([fill({ tradingSymbol: "HPL" })]).mapped[0].transaction.ticker,
    "HPL",
  );
}

console.log("\n6. Chronological sort (matcher depends on it)");
{
  const result = mapDhanFills([
    fill({ exchangeTradeId: "c", exchangeTime: "2025-06-30 09:40:08" }),
    fill({ exchangeTradeId: "a", exchangeTime: "2025-06-16 09:31:54" }),
    fill({ exchangeTradeId: "b", exchangeTime: "2025-06-25 13:25:26" }),
  ]);
  check(
    "reverse-order response sorted ascending",
    result.mapped.map((item) => item.externalTradeId),
    ["a", "b", "c"],
  );
}

console.log("\n7. End to end through the existing matcher");
{
  // Buy then sell, same symbol, fully closed.
  const result = mapDhanFills([
    fill({ exchangeTradeId: "s1", transactionType: "SELL", tradedPrice: 600, tradedQuantity: 150, exchangeTime: "2025-07-10 14:05:00" }),
    fill({ exchangeTradeId: "b1", transactionType: "BUY", tradedPrice: 556, tradedQuantity: 150, exchangeTime: "2025-06-30 09:40:08" }),
  ]);
  const trades = buildTradesFromTransactions(result.mapped.map((item) => item.transaction));
  check("one trade built", trades.length, 1);
  check("classified LONG", trades[0].tradeType, "LONG");
  check("classified CLOSED", trades[0].status, "CLOSED");
  check("both legs attached", trades[0].transactions.length, 2);
  check("entry leg first", trades[0].transactions[0].type, "BUY");

  // Lone sell - the incremental-sync case that needs a manual merge.
  const loneSell = mapDhanFills([
    fill({ exchangeTradeId: "s2", transactionType: "SELL", tradedPrice: 600, tradedQuantity: 150 }),
  ]);
  const orphan = buildTradesFromTransactions(loneSell.mapped.map((item) => item.transaction));
  check("lone sell becomes an OPEN SHORT (flagged in the UI)", [orphan[0].tradeType, orphan[0].status], ["SHORT", "OPEN"]);

  // Pyramid in, scale out.
  const complex = mapDhanFills([
    fill({ exchangeTradeId: "p1", transactionType: "BUY", tradedPrice: 100, tradedQuantity: 100, exchangeTime: "2025-06-02 09:30:00" }),
    fill({ exchangeTradeId: "p2", transactionType: "BUY", tradedPrice: 110, tradedQuantity: 50, exchangeTime: "2025-06-03 09:30:00" }),
    fill({ exchangeTradeId: "p3", transactionType: "SELL", tradedPrice: 120, tradedQuantity: 150, exchangeTime: "2025-06-05 09:30:00" }),
  ]);
  const complexTrades = buildTradesFromTransactions(complex.mapped.map((item) => item.transaction));
  check("pyramid then full exit is one closed trade", [complexTrades.length, complexTrades[0].status], [1, "CLOSED"]);
}

console.log("\n8. Dedupe simulation (what the endpoint does)");
{
  const batch = mapDhanFills([
    fill({ exchangeTradeId: "keep1" }),
    fill({ exchangeTradeId: "seen1" }),
    fill({ exchangeTradeId: "seen2" }),
  ]);
  const alreadyStored = new Set(["seen1", "seen2"]);
  const fresh = batch.mapped.filter(
    (item) => item.externalTradeId && !alreadyStored.has(item.externalTradeId),
  );
  check("second sync of overlapping range yields only new fills", fresh.length, 1);

  const allSeen = batch.mapped.filter(
    (item) => item.externalTradeId && !new Set(["keep1", "seen1", "seen2"]).has(item.externalTradeId),
  );
  check("identical re-sync yields nothing", allSeen.length, 0);

  const noId = mapDhanFills([fill({ exchangeTradeId: null })]);
  check(
    "fill with no dedupe id is excluded from writes",
    noId.mapped.filter((item) => item.externalTradeId).length,
    0,
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
