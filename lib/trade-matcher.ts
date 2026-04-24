import { TradeStatusValue } from "./trade-utils";

export type RawTransaction = {
  ticker: string;
  date: Date;
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
};

export type TxLeg = {
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
  date: Date;
};

export type MatchedTrade = {
  ticker: string;
  uniqueKey: number;
  status: TradeStatusValue;
  tradeType: "LONG" | "SHORT";
  transactions: TxLeg[];
};

/**
 * CORE TRADE MATCHING LOGIC
 * ─────────────────────────────────────────────────────────────────────
 * Rule: A trade is OPEN when cumulative (BUY qty − SELL qty) ≠ 0.
 *       A trade is CLOSED when cumulative qty reaches exactly 0.
 *
 * The algorithm walks each stock's transactions in strict chronological order
 * and accumulates a running net position:
 *   • BUY  → net position increases
 *   • SELL → net position decreases
 *
 * When net position hits 0 → the current batch of transactions forms one
 * CLOSED trade. The queue is reset and the next transaction for the same
 * ticker begins a fresh, independent trade.
 *
 * Supported patterns (all within one trade boundary):
 *   1. Simple:      BUY 100  → SELL 100                   (2 txn, CLOSED)
 *   2. Pyramid in:  BUY 100 → BUY 50 → SELL 150           (3 txn, CLOSED)
 *   3. Scale out:   BUY 200 → SELL 100 → SELL 100         (3 txn, CLOSED)
 *   4. Complex:     BUY 100 → BUY 50 → SELL 50 → SELL 100 (4 txn, CLOSED)
 *   5. Re-entry:    [Closed trade] → NEW BUY starts Trade #2 on same ticker
 *   6. Short:       SELL 100 → BUY 100                    (first txn is SELL → SHORT)
 *
 * Future enhancement hooks:
 *   • Lot-level FIFO P/L (match each exit to earliest unmatched entry lot)
 *   • Intraday vs swing classification (entry/exit same session)
 *   • Partial-close sub-tracking without closing the trade boundary
 * ─────────────────────────────────────────────────────────────────────
 */
export function buildTradesFromTransactions(
  rawTransactions: RawTransaction[]
): MatchedTrade[] {
  // Step 1: Sort all transactions strictly by date (oldest first)
  const chronological = [...rawTransactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Step 2: Group by ticker symbol
  const byTicker: Record<string, RawTransaction[]> = {};
  for (const txn of chronological) {
    if (!byTicker[txn.ticker]) byTicker[txn.ticker] = [];
    byTicker[txn.ticker].push(txn);
  }

  const matchedTrades: MatchedTrade[] = [];
  let uniqueKey = 1;

  for (const [ticker, txns] of Object.entries(byTicker)) {
    // Running net position for this ticker's current open trade
    let netQty = 0;
    // Transactions accumulated since the last trade boundary (0-crossing)
    let currentBatch: RawTransaction[] = [];

    for (const txn of txns) {
      currentBatch.push(txn);

      if (txn.type === "BUY") {
        netQty += txn.quantity;
      } else {
        netQty -= txn.quantity;
      }

      // Trade boundary: net position has returned exactly to zero
      // Round to 4 decimal places to avoid floating-point drift
      if (Math.abs(netQty) < 0.0001) {
        // Determine trade direction from the first transaction in the batch
        const isShort = currentBatch[0].type === "SELL";

        matchedTrades.push({
          ticker,
          uniqueKey: uniqueKey++,
          status: "CLOSED",
          tradeType: isShort ? "SHORT" : "LONG",
          transactions: currentBatch.map((t) => ({
            type: t.type,
            price: t.price,
            quantity: t.quantity,
            date: t.date,
          })),
        });

        // Reset: next transaction for this ticker starts a brand-new trade
        currentBatch = [];
        netQty = 0;
      }
    }

    // Any remaining transactions form an OPEN trade (position not yet closed)
    if (currentBatch.length > 0) {
      const isShort = currentBatch[0].type === "SELL";

      matchedTrades.push({
        ticker,
        uniqueKey: uniqueKey++,
        status: "OPEN",
        tradeType: isShort ? "SHORT" : "LONG",
        transactions: currentBatch.map((t) => ({
          type: t.type,
          price: t.price,
          quantity: t.quantity,
          date: t.date,
        })),
      });
    }
  }

  return matchedTrades;
}
