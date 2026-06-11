import { Competition, Trade, Transaction, User } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { z } from "zod";
import {
  exitTriggerValues,
  growthAreaValues,
  proficiencyValues,
  setupValues,
} from "@/lib/constants";

export const segmentSchema = z.enum([
  "EQUITY",
  "INTRADAY",
  "OPTIONS",
  "FUTURES",
]);
export const tradeTypeSchema = z.enum(["LONG", "SHORT"]);
export const tradeStatusSchema = z.enum(["OPEN", "CLOSED"]);
export const competitionVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export const userRoleSchema = z.enum(["ADMIN", "TRADER", "SUPER_TRADER"]);
export const approvalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

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

const optionalJournalAttribute = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.string().trim().max(500).optional());

function parseJournalAttributeList(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateOptionalListValue(
  value: string | undefined,
  allowedValues: readonly string[],
  ctx: z.RefinementCtx,
  path: string,
) {
  const values = parseJournalAttributeList(value);
  const hasInvalidValue = values.some((item) => !allowedValues.includes(item));
  if (hasInvalidValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid ${path}.`,
      path: [path],
    });
  }
}

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
    setup: optionalJournalAttribute,
    planFollowed: z.boolean().optional().nullable(),
    exitTrigger: optionalJournalAttribute,
    proficiency: optionalJournalAttribute,
    growthAreas: optionalJournalAttribute,
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
    validateOptionalListValue(data.setup, setupValues, ctx, "setup");
    validateOptionalListValue(data.exitTrigger, exitTriggerValues, ctx, "exitTrigger");
    validateOptionalListValue(data.proficiency, proficiencyValues, ctx, "proficiency");
    validateOptionalListValue(data.growthAreas, growthAreaValues, ctx, "growthAreas");
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

export function calculateTradePnl(trade: TradeWithTxns): {
  realizedPnl: number;
  unrealizedPnl: number;
} {
  const entryP = getWeightedEntryPrice(trade);
  const entryQ = getTotalEntryQty(trade);
  const exitP = getWeightedExitPrice(trade);
  const exitQ = getTotalExitQty(trade);
  const charges = trade.charges || 0;

  const remainingQ = Math.max(0, entryQ - exitQ);
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  const isActuallyClosed = remainingQ === 0;

  if (isActuallyClosed) {
    const pnlQty = exitQ > 0 ? exitQ : entryQ;
    const grossPnl =
      trade.tradeType === "LONG"
        ? (exitP - entryP) * pnlQty
        : (entryP - exitP) * pnlQty;
    realizedPnl = grossPnl - charges;
  } else {
    if (exitQ > 0) {
      const grossRealized =
        trade.tradeType === "LONG"
          ? (exitP - entryP) * exitQ
          : (entryP - exitP) * exitQ;
      realizedPnl = grossRealized - charges;
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
  }

  return { realizedPnl, unrealizedPnl };
}

export function calculateOpenPnl(trade: TradeWithTxns): number {
  const { realizedPnl, unrealizedPnl } = calculateTradePnl(trade);
  return realizedPnl + unrealizedPnl;
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

import type { TradeType, TradeStatus } from "@prisma/client";

export function deriveTradeTypeAndStatus(
  transactions: { type: string; dateTime: Date; quantity: number }[],
) {
  const sorted = [...transactions].sort(
    (a, b) => a.dateTime.getTime() - b.dateTime.getTime(),
  );
  const tradeType: TradeType = sorted[0]?.type === "BUY" ? "LONG" : "SHORT";
  const entryType = tradeType === "LONG" ? "BUY" as const : "SELL" as const;
  const exitType = tradeType === "LONG" ? "SELL" as const : "BUY" as const;

  const entryTxns = sorted
    .filter((t) => t.type === entryType)
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  const firstEntryAt = entryTxns.length > 0 ? entryTxns[0].dateTime : new Date();

  const totalEntryQ = sorted
    .filter((t) => t.type === entryType)
    .reduce((s, t) => s + t.quantity, 0);
  const totalExitQ = sorted
    .filter((t) => t.type === exitType)
    .reduce((s, t) => s + t.quantity, 0);
  const status: TradeStatus = totalExitQ >= totalEntryQ ? "CLOSED" : "OPEN";

  return { tradeType, firstEntryAt, status, entryType, exitType, entryTxns, totalEntryQ, totalExitQ };
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
    setup: parseJournalAttributeList(payload.setup).join(", ") || null,
    planFollowed: payload.planFollowed ?? null,
    exitTrigger: parseJournalAttributeList(payload.exitTrigger).join(", ") || null,
    proficiency: parseJournalAttributeList(payload.proficiency).join(", ") || null,
    growthAreas: parseJournalAttributeList(payload.growthAreas).join(", ") || null,
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
  realizedPnl: number;
  unrealizedPnl: number;
  capital: number;
  allocationPct: number;
  ageDays: number;
  impactPct: number;
  openQty: number;
  openCapital: number;
  stopLoss: number | null;
  stopLossPct: number | null;
  closingPrice: number | null;
  setup: string | null;
  planFollowed: boolean | null;
  exitTrigger: string | null;
  proficiency: string | null;
  growthAreas: string | null;
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
    const isActuallyClosed = openQty === 0;
    const derivedStatus: "OPEN" | "CLOSED" = isActuallyClosed
      ? "CLOSED"
      : "OPEN";

    // Compute split P&L from transactions (not from stale stored netPnl).
    const { realizedPnl, unrealizedPnl } = calculateTradePnl(trade);
    const displayPnl = realizedPnl + unrealizedPnl;

    const capital = trade.capitalUsed || weightedEntry * totalEntryQty;
    const pnlPct = capital > 0 ? (displayPnl / capital) * 100 : 0;

    const openCapital = openQty > 0 ? weightedEntry * openQty : 0;
    const capitalForAlloc = openQty > 0 ? openCapital : capital;
    const allocationPct =
      portfolioCapital > 0 ? (capitalForAlloc / portfolioCapital) * 100 : 0;
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
      realizedPnl,
      unrealizedPnl,
      capital,
      allocationPct,
      ageDays,
      impactPct,
      openQty,
      openCapital,
      stopLoss: trade.stopLoss,
      stopLossPct,
      closingPrice: trade.closingPrice,
      setup: trade.setup,
      planFollowed: trade.planFollowed,
      exitTrigger: trade.exitTrigger,
      proficiency: trade.proficiency,
      growthAreas: trade.growthAreas,
    };
  });
}

export function buildGroupedJournalMetrics(
  rows: GroupedTradeRow[],
  portfolioCapital: number = 100000,
) {
  // Only fully closed trades count towards win rate, profit factor, etc.
  const fullyClosedRows = rows.filter((row) => row.derivedStatus === "CLOSED");
  const winningRows = fullyClosedRows.filter((row) => row.realizedPnl > 0);
  const grossProfit = winningRows.reduce((sum, row) => sum + row.realizedPnl, 0);
  const grossLoss = Math.abs(
    fullyClosedRows
      .filter((row) => row.realizedPnl < 0)
      .reduce((sum, row) => sum + row.realizedPnl, 0),
  );
  const totalPnl = rows.reduce((sum, row) => sum + row.pnlAmount, 0);
  const totalCapital = rows.reduce((sum, row) => sum + row.capital, 0);

  return {
    closedTrades: fullyClosedRows.length,
    winRate: fullyClosedRows.length > 0 ? (winningRows.length / fullyClosedRows.length) * 100 : 0,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? grossProfit : 0) : grossProfit / grossLoss,
    returnOnCapital: totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0,
    portfolioReturn: portfolioCapital > 0 ? (totalPnl / portfolioCapital) * 100 : 0,
    totalPnl,
  };
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

      const rows = buildGroupedJournalRows(trades, user.portfolioCapital);
      const metrics = buildGroupedJournalMetrics(rows, user.portfolioCapital);
      const maxCapitalDeployed = calculateMaxCapitalDeployed(trades);

      return {
        userId: user.id,
        userName: user.name,
        returnPercentage: metrics.returnOnCapital,
        portfolioImpactPct: metrics.portfolioReturn,
        maxDrawdown: calculateMaxDrawdown(trades, maxCapitalDeployed),
        winRate: metrics.winRate,
        totalTrades: rows.length,
        profitFactor: metrics.profitFactor,
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

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

export function getCompetitionDateWindow(
  competition: Pick<Competition, "startDate" | "endDate">,
) {
  return {
    startDate: startOfUtcDay(competition.startDate),
    endDate: endOfUtcDay(competition.endDate),
  };
}

export function parseCompetitionDateRange(startDate: string, endDate: string) {
  return {
    startDate: startOfUtcDay(new Date(startDate)),
    endDate: endOfUtcDay(new Date(endDate)),
  };
}

export function getCompetitionWindowTrades(
  trades: TradeWithTxns[],
  competition: Pick<Competition, "startDate" | "endDate">,
) {
  const competitionWindow = getCompetitionDateWindow(competition);

  return trades.filter((trade) => {
    const firstEntry = getFirstEntryTime(trade);
    return (
      firstEntry >= competitionWindow.startDate &&
      firstEntry <= competitionWindow.endDate
    );
  });
}
