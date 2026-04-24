import { Competition, Trade, Transaction, User } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { z } from "zod";

export const segmentSchema = z.enum([
  "EQUITY",
  "INTRADAY",
  "OPTIONS",
  "FUTURES",
]);
export const tradeTypeSchema = z.enum(["LONG", "SHORT"]);
export const tradeStatusSchema = z.enum(["OPEN", "CLOSED"]);
export const competitionVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export const userRoleSchema = z.enum(["ADMIN", "TRADER"]);
export const approvalStatusSchema = z.enum(["PENDING", "APPROVED"]);

export type SegmentValue = z.infer<typeof segmentSchema>;
export type TradeTypeValue = z.infer<typeof tradeTypeSchema>;
export type TradeStatusValue = z.infer<typeof tradeStatusSchema>;

const isoDateString = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Expected a valid date-time string.",
  });

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().positive().optional());

export const transactionSchema = z.object({
  type: z.enum(["BUY", "SELL"]),
  price: z.coerce.number().positive(),
  quantity: z.coerce.number().positive(),
  dateTime: isoDateString,
});

export const tradePayloadSchema = z
  .object({
    competitionId: z.string().optional().nullable(),
    symbol: z.string().trim().min(1).max(40),
    segment: segmentSchema,
    tradeType: tradeTypeSchema,
    transactions: z
      .array(transactionSchema)
      .min(1, "At least one transaction is required."),
    closingPrice: optionalNumber,
    stopLoss: optionalNumber,
    charges: z.coerce.number().min(0).default(0),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    notes: z.string().max(2000).optional(),
    status: tradeStatusSchema.default("OPEN"),
  })
  .superRefine((data, ctx) => {
    if (data.status === "CLOSED") {
      const exitType = data.tradeType === "LONG" ? "SELL" : "BUY";
      const hasExit = data.transactions.some((t) => t.type === exitType);
      if (!hasExit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "At least one exit transaction is required for closed trades.",
          path: ["transactions"],
        });
      }
    }
  });

export const competitionPayloadSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    startDate: isoDateString,
    endDate: isoDateString,
    visibility: competitionVisibilitySchema,
  })
  .superRefine((data, ctx) => {
    if (new Date(data.endDate) <= new Date(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Competition end date must be later than start date.",
        path: ["endDate"],
      });
    }
  });

export const joinCompetitionSchema = z.object({
  competitionId: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

// ─── Transaction helpers ────────────────────────────────────────────────────

export type TradeTx = Pick<
  Transaction,
  "type" | "price" | "quantity" | "dateTime"
>;

export type TradeWithTxns = Trade & { transactions: TradeTx[] };

export function getEntryTransactions(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): TradeTx[] {
  const entryType = trade.tradeType === "LONG" ? "BUY" : "SELL";
  return trade.transactions
    .filter((t) => t.type === entryType)
    .sort(
      (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
    );
}

export function getExitTransactions(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): TradeTx[] {
  const exitType = trade.tradeType === "LONG" ? "SELL" : "BUY";
  return trade.transactions
    .filter((t) => t.type === exitType)
    .sort(
      (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
    );
}

export function getTotalEntryQty(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): number {
  return getEntryTransactions(trade).reduce((sum, t) => sum + t.quantity, 0);
}

export function getTotalExitQty(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): number {
  return getExitTransactions(trade).reduce((sum, t) => sum + t.quantity, 0);
}

export function getWeightedEntryPrice(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): number {
  const entries = getEntryTransactions(trade);
  const totalQty = entries.reduce((sum, t) => sum + t.quantity, 0);
  if (totalQty === 0) return 0;
  return entries.reduce((sum, t) => sum + t.price * t.quantity, 0) / totalQty;
}

export function getWeightedExitPrice(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): number {
  const exits = getExitTransactions(trade);
  const totalQty = exits.reduce((sum, t) => sum + t.quantity, 0);
  if (totalQty === 0) return 0;
  return exits.reduce((sum, t) => sum + t.price * t.quantity, 0) / totalQty;
}

export function getFirstEntryTime(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): Date {
  const entries = getEntryTransactions(trade);
  return entries.length > 0 ? new Date(entries[0].dateTime) : new Date();
}

export function getLastExitTime(trade: {
  tradeType: string;
  transactions: TradeTx[];
}): Date | null {
  const exits = getExitTransactions(trade);
  return exits.length > 0 ? new Date(exits[exits.length - 1].dateTime) : null;
}

export type TradeWithRelations = TradeWithTxns & {
  user: User;
  images: { id: string; imageUrl: string; uploadedAt: Date }[];
  competition: Competition | null;
};

export function sanitizeTags(tags?: string[] | string) {
  if (!tags) return "";
  const list = Array.isArray(tags) ? tags : tags.split(",");
  return Array.from(
    new Set(list.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  ).join(",");
}

export function parseTags(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function calculateTradeMetrics(trade: {
  tradeType: string;
  status: string;
  transactions: { type: string; price: number; quantity: number }[];
  charges?: number | null;
  capitalUsed?: number | null;
}) {
  const entryType = trade.tradeType === "LONG" ? "BUY" : "SELL";
  const exitType = trade.tradeType === "LONG" ? "SELL" : "BUY";

  const entries = trade.transactions.filter((t) => t.type === entryType);
  const exits = trade.transactions.filter((t) => t.type === exitType);

  const totalEntryQty = entries.reduce((sum, t) => sum + t.quantity, 0);
  const totalExitQty = exits.reduce((sum, t) => sum + t.quantity, 0);

  const weightedEntry =
    totalEntryQty > 0
      ? entries.reduce((sum, t) => sum + t.price * t.quantity, 0) /
        totalEntryQty
      : 0;
  const weightedExit =
    totalExitQty > 0
      ? exits.reduce((sum, t) => sum + t.price * t.quantity, 0) / totalExitQty
      : 0;

  const nominalCapital = Math.abs(weightedEntry * totalEntryQty);
  const capitalUsed = trade.capitalUsed || nominalCapital;
  const charges = trade.charges || 0;

  if (trade.status !== "CLOSED") {
    return { realizedPnl: 0, capitalUsed };
  }

  const pnlQty = totalExitQty > 0 ? totalExitQty : totalEntryQty;
  const grossPnl =
    trade.tradeType === "LONG"
      ? (weightedExit - weightedEntry) * pnlQty
      : (weightedEntry - weightedExit) * pnlQty;

  return { realizedPnl: grossPnl - charges, capitalUsed };
}

export function calculateOpenPnl(trade: TradeWithTxns): number {
  const entryP = getWeightedEntryPrice(trade);
  const entryQ = getTotalEntryQty(trade);
  const exitP = getWeightedExitPrice(trade);
  const exitQ = getTotalExitQty(trade);
  const charges = trade.charges || 0;

  const remainingQ = Math.max(0, entryQ - exitQ);
  let realizedPnl = 0;
  let unrealizedPnl = 0;

  if (exitQ > 0) {
    if (trade.tradeType === "LONG") {
      realizedPnl = (exitP - entryP) * exitQ;
    } else {
      realizedPnl = (entryP - exitP) * exitQ;
    }
  }

  const closingP =
    trade.closingPrice && trade.closingPrice > 0 ? trade.closingPrice : 0;

  if (remainingQ > 0 && closingP > 0) {
    if (trade.tradeType === "LONG") {
      unrealizedPnl = (closingP - entryP) * remainingQ;
    } else {
      unrealizedPnl = (entryP - closingP) * remainingQ;
    }
  }

  const result = realizedPnl + unrealizedPnl - charges;

  return result;
}

export function calculateWinRate(trades: Pick<Trade, "netPnl">[]) {
  if (!trades.length) return 0;
  const winners = trades.filter((t) => t.netPnl > 0).length;
  return (winners / trades.length) * 100;
}

export function calculateProfitFactor(trades: Pick<Trade, "netPnl">[]) {
  const grossProfit = trades
    .filter((t) => t.netPnl > 0)
    .reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0),
  );
  if (grossLoss === 0) return grossProfit > 0 ? grossProfit : 0;
  return grossProfit / grossLoss;
}

export function calculateAverageWinLoss(trades: Pick<Trade, "netPnl">[]) {
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const averageWin =
    wins.reduce((s, t) => s + t.netPnl, 0) / (wins.length || 1);
  const averageLoss =
    Math.abs(losses.reduce((s, t) => s + t.netPnl, 0)) / (losses.length || 1);
  return {
    averageWin,
    averageLoss,
    riskRewardRatio: averageLoss === 0 ? averageWin : averageWin / averageLoss,
  };
}

export function calculateMaxCapitalDeployed(trades: TradeWithTxns[]) {
  const events = trades.flatMap((trade) => [
    {
      at: getFirstEntryTime(trade).getTime(),
      delta: trade.capitalUsed,
      order: 1,
    },
    {
      at: (getLastExitTime(trade) ?? new Date()).getTime(),
      delta: -trade.capitalUsed,
      order: 0,
    },
  ]);

  events.sort((a, b) => (a.at === b.at ? a.order - b.order : a.at - b.at));

  let running = 0;
  let peak = 0;
  for (const ev of events) {
    running += ev.delta;
    peak = Math.max(peak, running);
  }
  return peak;
}

export function calculateMaxDrawdown(
  trades: TradeWithTxns[],
  maxCapitalDeployed: number,
) {
  if (!trades.length || maxCapitalDeployed <= 0) return 0;

  const sorted = [...trades].sort((a, b) => {
    const la = getLastExitTime(a)?.getTime() ?? 0;
    const lb = getLastExitTime(b)?.getTime() ?? 0;
    return la - lb;
  });

  let cumulativePnl = 0;
  let peakReturn = 0;
  let maxDrawdown = 0;

  for (const trade of sorted) {
    cumulativePnl += trade.netPnl;
    const currentReturn = (cumulativePnl / maxCapitalDeployed) * 100;
    peakReturn = Math.max(peakReturn, currentReturn);
    maxDrawdown = Math.max(maxDrawdown, peakReturn - currentReturn);
  }
  return maxDrawdown;
}

export function buildDashboardMetrics(trades: TradeWithTxns[]) {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const openTrades = trades.filter((t) => t.status === "OPEN");
  const maxCapitalDeployed = calculateMaxCapitalDeployed(closedTrades);
  const totalRealizedPnl = closedTrades.reduce((s, t) => s + t.netPnl, 0);
  const totalOpenPnl = openTrades.reduce((s, t) => s + calculateOpenPnl(t), 0);
  const totalMtmPnl = totalRealizedPnl + totalOpenPnl;

  return {
    totalTrades: closedTrades.length,
    openTrades: openTrades.length,
    winRate: calculateWinRate(closedTrades),
    ...calculateAverageWinLoss(closedTrades),
    profitFactor: calculateProfitFactor(closedTrades),
    maxDrawdown: calculateMaxDrawdown(closedTrades, maxCapitalDeployed),
    maxCapitalDeployed,
    totalRealizedPnl,
    totalMtmPnl,
    returnOnCapital:
      maxCapitalDeployed > 0 ? (totalMtmPnl / maxCapitalDeployed) * 100 : 0,
  };
}

export function groupTradesBySymbol(trades: TradeWithTxns[]) {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const grouped = new Map<string, any>();

  for (const trade of closedTrades) {
    const entryQ = getTotalEntryQty(trade);
    const entryP = getWeightedEntryPrice(trade);
    const exitP = getWeightedExitPrice(trade);

    const current = grouped.get(trade.symbol) ?? {
      symbol: trade.symbol,
      totalTrades: 0,
      totalQuantity: 0,
      totalNetPnl: 0,
      profitableTrades: 0,
      weightedEntry: 0,
      weightedExit: 0,
    };

    current.totalTrades += 1;
    current.totalQuantity += entryQ;
    current.totalNetPnl += trade.netPnl;
    current.profitableTrades += trade.netPnl > 0 ? 1 : 0;
    current.weightedEntry += entryP * entryQ;
    current.weightedExit += exitP * entryQ;

    grouped.set(trade.symbol, current);
  }

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      winRate: item.totalTrades
        ? (item.profitableTrades / item.totalTrades) * 100
        : 0,
      weightedAvgEntry: item.totalQuantity
        ? item.weightedEntry / item.totalQuantity
        : 0,
      weightedAvgExit: item.totalQuantity
        ? item.weightedExit / item.totalQuantity
        : 0,
    }))
    .sort((a, b) => b.totalNetPnl - a.totalNetPnl);
}

export function normalizeTradePayload(
  payload: z.infer<typeof tradePayloadSchema>,
) {
  return {
    competitionId: payload.competitionId || null,
    symbol: payload.symbol.trim().toUpperCase(),
    segment: payload.segment,
    tradeType: payload.tradeType,
    status: payload.status,
    tags: sanitizeTags(payload.tags),
    notes: payload.notes?.trim() ?? "",
    charges: payload.charges,
    closingPrice: payload.closingPrice ?? null,
    stopLoss: payload.stopLoss ?? null,
    transactions: payload.transactions,
  };
}

export type EntryLeg = {
  qty: number;
  price: number;
  dateTime: Date;
};

export type GroupedTradeRow = {
  id: string;
  symbol: string;
  status: "OPEN" | "CLOSED";
  derivedStatus: "OPEN" | "CLOSED"; // CLOSED when openQty reaches 0 regardless of DB status
  tradeType: string;
  entryLegs: EntryLeg[];
  exitLegs: EntryLeg[];
  totalEntryQty: number;
  weightedEntryPrice: number;
  exitQty: number;
  exitPrice: number;
  exitDateTime: Date | null;
  pnlPct: number;
  pnlAmount: number;
  capital: number;
  allocationPct: number;
  ageDays: number;
  impactPct: number;
  openQty: number;
  openCapital: number;
  stopLossPct: number | null;
  closingPrice: number | null;
};

export function buildGroupedJournalRows(
  trades: TradeWithTxns[],
  portfolioCapital: number = 100000,
): GroupedTradeRow[] {
  return trades.map((trade) => {
    const entries = getEntryTransactions(trade);
    const exits = getExitTransactions(trade);

    const entryLegs: EntryLeg[] = entries.map((t) => ({
      qty: t.quantity,
      price: t.price,
      dateTime: new Date(t.dateTime),
    }));

    const exitLegs: EntryLeg[] = exits.map((t) => ({
      qty: t.quantity,
      price: t.price,
      dateTime: new Date(t.dateTime),
    }));

    const totalEntryQty = getTotalEntryQty(trade);
    const weightedEntry = getWeightedEntryPrice(trade);
    const exitQ = getTotalExitQty(trade);
    const exitP = getWeightedExitPrice(trade);
    const lastExit = getLastExitTime(trade);

    const openQty = Math.max(0, totalEntryQty - exitQ);
    const isActuallyClosed = openQty <= 0;
    const derivedStatus: "OPEN" | "CLOSED" = isActuallyClosed
      ? "CLOSED"
      : "OPEN";

    // IMPORTANT: If the trade is actually open (qty doesn't match),
    // always use calculateOpenPnl regardless of the DB status flag.
    const displayPnl = isActuallyClosed
      ? trade.netPnl
      : calculateOpenPnl(trade);

    const capital = trade.capitalUsed || weightedEntry * totalEntryQty;
    const pnlPct = capital > 0 ? (displayPnl / capital) * 100 : 0;

    const openCapital = openQty > 0 ? weightedEntry * openQty : 0;
    const allocationPct =
      portfolioCapital > 0 ? (openCapital / portfolioCapital) * 100 : 0;
    const impactPct =
      portfolioCapital > 0 ? (displayPnl / portfolioCapital) * 100 : 0;

    const firstEntry = getFirstEntryTime(trade);
    const endDate = isActuallyClosed && lastExit ? lastExit : new Date();
    const ageDays = Math.max(0, differenceInDays(endDate, firstEntry));

    let stopLossPct: number | null = null;
    if (trade.stopLoss && trade.stopLoss > 0 && weightedEntry > 0) {
      stopLossPct = ((trade.stopLoss - weightedEntry) / weightedEntry) * 100;
    }

    return {
      id: trade.id,
      symbol: trade.symbol,
      status: trade.status as "OPEN" | "CLOSED",
      derivedStatus,
      tradeType: trade.tradeType,
      entryLegs,
      exitLegs,
      totalEntryQty,
      weightedEntryPrice: weightedEntry,
      exitQty: exitQ,
      exitPrice: exitP,
      exitDateTime: lastExit,
      pnlPct,
      pnlAmount: displayPnl,
      capital,
      allocationPct,
      ageDays,
      impactPct,
      openQty,
      openCapital,
      stopLossPct,
      closingPrice: trade.closingPrice,
    };
  });
}

export function buildJournalRows(
  trades: TradeWithTxns[],
  portfolioCapital: number,
) {
  return trades.map((trade, index) => {
    const entryP = getWeightedEntryPrice(trade);
    const entryQ = getTotalEntryQty(trade);
    const displayPnl =
      trade.status === "CLOSED" ? trade.netPnl : calculateOpenPnl(trade);
    const capital = trade.capitalUsed || entryP * entryQ;

    let slPct = 0;
    if (trade.stopLoss && entryP > 0) {
      slPct = Math.abs((trade.stopLoss - entryP) / entryP) * 100;
    }

    return {
      id: trade.id,
      rowNumber: trade.rowIndex || index + 1,
      entryExit: trade.status === "CLOSED" ? "Exit" : "Entry",
      type: trade.tradeType,
      ticker: trade.symbol,
      entryDate: getFirstEntryTime(trade),
      price: entryP,
      qty: entryQ,
      stopLoss: trade.stopLoss,
      slPct,
      setup: parseTags(trade.tags).join(", ") || "Manual",
      capital,
      allocationPct:
        portfolioCapital > 0 ? (capital / portfolioCapital) * 100 : 0,
      pnlOpen: trade.status === "OPEN" ? calculateOpenPnl(trade) : 0,
      pnlCombined: displayPnl,
      pnlPct: capital > 0 ? (displayPnl / capital) * 100 : 0,
      ageDays: Math.max(
        differenceInDays(new Date(), getFirstEntryTime(trade)),
        0,
      ),
      impactPct:
        portfolioCapital > 0 ? (displayPnl / portfolioCapital) * 100 : 0,
      closingPrice: trade.closingPrice,
      status: trade.status,
      originalTrade: trade,
    };
  });
}

export type LeaderboardInput = {
  trades: TradeWithTxns[];
  user: User;
};

export type LeaderboardEntry = {
  userId: string;
  userName: string;
  returnPercentage: number;
  portfolioImpactPct: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  rank?: number;
};

export function buildLeaderboardEntries(entries: LeaderboardInput[]) {
  return entries
    .map(({ trades, user }) => {
      if (!user.emailVerifiedAt || user.approvalStatus !== "APPROVED") {
        return null;
      }

      const totalNetPnl = trades.reduce((s, t) => {
        const pnl = t.status === "CLOSED" ? t.netPnl : calculateOpenPnl(t);
        return s + pnl;
      }, 0);
      const totalCapitalUsed = trades.reduce((s, t) => s + t.capitalUsed, 0);
      const maxCapitalDeployed = calculateMaxCapitalDeployed(trades);
      const returnPercentage =
        totalCapitalUsed > 0 ? (totalNetPnl / totalCapitalUsed) * 100 : 0;
      const portfolioImpactPct =
        user.portfolioCapital > 0
          ? (totalNetPnl / user.portfolioCapital) * 100
          : 0;

      return {
        userId: user.id,
        userName: user.name,
        returnPercentage,
        portfolioImpactPct,
        maxDrawdown: calculateMaxDrawdown(trades, maxCapitalDeployed),
        winRate: calculateWinRate(trades),
        totalTrades: trades.length,
        profitFactor: calculateProfitFactor(trades),
      } as LeaderboardEntry;
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null)
    .sort((left, right) => {
      if (right.portfolioImpactPct !== left.portfolioImpactPct) {
        return right.portfolioImpactPct - left.portfolioImpactPct;
      }
      if (left.maxDrawdown !== right.maxDrawdown) {
        return left.maxDrawdown - right.maxDrawdown;
      }
      return right.winRate - left.winRate;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function filterTradesByTag<T extends { tags: string }>(
  trades: T[],
  tag?: string,
) {
  if (!tag) return trades;
  const normalizedTag = tag.toLowerCase();
  return trades.filter((t) =>
    parseTags(t.tags).some((tradeTag) => tradeTag === normalizedTag),
  );
}

export function getCompetitionWindowTrades(
  trades: TradeWithTxns[],
  competition: Pick<Competition, "startDate" | "endDate">,
) {
  return trades.filter((trade) => {
    const firstEntry = getFirstEntryTime(trade);
    const lastExit = getLastExitTime(trade);

    const startsInWindow =
      firstEntry >= competition.startDate && firstEntry <= competition.endDate;
    const endsInWindow =
      lastExit &&
      lastExit >= competition.startDate &&
      lastExit <= competition.endDate;
    const closedInWindow =
      trade.status === "CLOSED" &&
      trade.updatedAt >= competition.startDate &&
      trade.updatedAt <= competition.endDate;

    return startsInWindow || endsInWindow || closedInWindow;
  });
}
