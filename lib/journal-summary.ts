import { format } from "date-fns";
import { setupValues } from "@/lib/constants";
import type { GroupedTradeRow, TradeWithTxns } from "@/lib/trade-utils";

export type SummaryMetricRow = {
  label: string;
  grossR: number;
  netR: number;
  totalTrades: number;
  defaultStopLossTrades: number;
  wins: number;
  losses: number;
  winPct: number | null;
  winAverage: number | null;
  lossAverage: number | null;
  simpleRR: number | null;
  awlr: number | null;
  maxWin: number | null;
  maxLoss: number | null;
  maxR: number | null;
  minR: number | null;
  avgWinDays: number | null;
  avgLossDays: number | null;
};

type ClosedSummaryTrade = {
  row: GroupedTradeRow;
  grossPct: number;
  netPct: number;
  riskAmount: number;
  riskPct: number;
  stopLossPct: number;
  grossR: number;
  netR: number;
  usedDefaultStopLoss: boolean;
  setups: string[];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const QUARTERS = [
  { label: "Q1 - Jan - Mar", monthIndexes: [0, 1, 2] },
  { label: "Q2 - Apr - Jun", monthIndexes: [3, 4, 5] },
  { label: "Q3 - Jul - Sep", monthIndexes: [6, 7, 8] },
  { label: "Q4 - Oct - Dec", monthIndexes: [9, 10, 11] },
];

function splitSetup(value: string | null) {
  if (!value) return ["Unassigned"];
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ["Unassigned"];
}

function safeRatio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxOrNull(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function minOrNull(values: number[]) {
  return values.length > 0 ? Math.min(...values) : null;
}

function averageMetricRows(label: string, rows: SummaryMetricRow[]): SummaryMetricRow {
  const activeRows = rows.filter((row) => row.totalTrades > 0);

  return {
    label,
    grossR: average(activeRows.map((row) => row.grossR)) ?? 0,
    netR: average(activeRows.map((row) => row.netR)) ?? 0,
    totalTrades: activeRows.reduce((sum, row) => sum + row.totalTrades, 0),
    defaultStopLossTrades: activeRows.reduce((sum, row) => sum + row.defaultStopLossTrades, 0),
    wins: activeRows.reduce((sum, row) => sum + row.wins, 0),
    losses: activeRows.reduce((sum, row) => sum + row.losses, 0),
    winPct: average(activeRows.map((row) => row.winPct).filter((value): value is number => value !== null)),
    winAverage: average(activeRows.map((row) => row.winAverage).filter((value): value is number => value !== null)),
    lossAverage: average(activeRows.map((row) => row.lossAverage).filter((value): value is number => value !== null)),
    simpleRR: average(activeRows.map((row) => row.simpleRR).filter((value): value is number => value !== null)),
    awlr: null,
    maxWin: maxOrNull(activeRows.map((row) => row.maxWin).filter((value): value is number => value !== null)),
    maxLoss: minOrNull(activeRows.map((row) => row.maxLoss).filter((value): value is number => value !== null)),
    maxR: maxOrNull(activeRows.map((row) => row.maxR).filter((value): value is number => value !== null)),
    minR: minOrNull(activeRows.map((row) => row.minR).filter((value): value is number => value !== null)),
    avgWinDays: average(activeRows.map((row) => row.avgWinDays).filter((value): value is number => value !== null)),
    avgLossDays: average(activeRows.map((row) => row.avgLossDays).filter((value): value is number => value !== null)),
  };
}

export function summarize(label: string, trades: ClosedSummaryTrade[]): SummaryMetricRow {
  const winning = trades.filter((trade) => trade.row.realizedPnl >= 0);
  const losing = trades.filter((trade) => trade.row.realizedPnl < 0);
  const winAverage = average(winning.map((trade) => trade.netPct));
  const lossAverage = average(losing.map((trade) => Math.abs(trade.netPct)));
  const winPct = trades.length > 0 ? winning.length / trades.length : null;
  const simpleRR =
    winAverage !== null && lossAverage !== null && lossAverage !== 0
      ? winAverage / lossAverage
      : null;
  const awlr =
    winPct !== null &&
    winAverage !== null &&
    lossAverage !== null &&
    lossAverage !== 0 &&
    winPct < 1
      ? (winAverage * winPct) / ((1 - winPct) * lossAverage)
      : null;

  return {
    label,
    grossR: trades.reduce((sum, trade) => sum + trade.grossR, 0),
    netR: trades.reduce((sum, trade) => sum + trade.netR, 0),
    totalTrades: trades.length,
    defaultStopLossTrades: trades.filter((trade) => trade.usedDefaultStopLoss).length,
    wins: winning.length,
    losses: losing.length,
    winPct,
    winAverage,
    lossAverage,
    simpleRR,
    awlr,
    maxWin: maxOrNull(trades.map((trade) => trade.netPct)),
    maxLoss: minOrNull(trades.map((trade) => trade.netPct)),
    maxR: maxOrNull(trades.map((trade) => trade.netR)),
    minR: minOrNull(trades.map((trade) => trade.netR)),
    avgWinDays: average(winning.map((trade) => trade.row.ageDays)),
    avgLossDays: average(losing.map((trade) => trade.row.ageDays)),
  };
}

function getRiskProfile(row: GroupedTradeRow, charges: number) {
  const entryPrice = row.entryLegs[0]?.price ?? row.weightedEntryPrice;
  const entryQty = row.totalEntryQty;
  const capital = row.capital || entryPrice * entryQty;
  const usedDefaultStopLoss = !row.stopLoss || row.stopLoss <= 0;
  const stopLoss = usedDefaultStopLoss
    ? row.tradeType === "SHORT"
      ? entryPrice * 1.03
      : entryPrice * 0.97
    : row.stopLoss ?? entryPrice;
  const priceRisk = Math.abs(entryPrice - stopLoss) * entryQty;
  const riskAmount = priceRisk + Math.max(0, charges);
  const stopLossPct = entryPrice > 0 ? (Math.abs(entryPrice - stopLoss) / entryPrice) * 100 : 0;
  const riskPct = capital > 0 ? (riskAmount / capital) * 100 : 0;

  return { riskAmount, riskPct, stopLossPct, usedDefaultStopLoss };
}

export function buildClosedSummaryTrades(
  rows: GroupedTradeRow[],
  trades: TradeWithTxns[],
): ClosedSummaryTrade[] {
  const chargesById = new Map(trades.map((trade) => [trade.id, trade.charges ?? 0]));

  return rows
    .filter((row) => row.derivedStatus === "CLOSED")
    .map((row) => {
      const capital = row.capital || 0;
      const charges = chargesById.get(row.id) ?? 0;
      const grossPnl = row.realizedPnl + charges;
      const grossPct = capital > 0 ? (grossPnl / capital) * 100 : 0;
      const netPct = capital > 0 ? (row.realizedPnl / capital) * 100 : 0;
      const { riskAmount, riskPct, stopLossPct, usedDefaultStopLoss } = getRiskProfile(row, charges);
      const grossR = safeRatio(netPct, stopLossPct);

      return {
        row,
        grossPct,
        netPct,
        riskAmount,
        riskPct,
        stopLossPct,
        grossR,
        netR: grossR * riskPct,
        usedDefaultStopLoss,
        setups: splitSetup(row.setup),
      };
    });
}

export function buildSetupSummary(trades: ClosedSummaryTrade[]) {
  const setupLabels = Array.from(
    new Set([...setupValues, ...trades.flatMap((trade) => trade.setups)]),
  );

  const rows = setupLabels.map((setup) =>
    summarize(
      setup,
      trades.filter((trade) => trade.setups.includes(setup)),
    ),
  ).filter((row) => row.totalTrades > 0);

  return {
    rows,
    total: summarize("Total", trades),
  };
}

export function buildMonthlySummary(trades: ClosedSummaryTrade[]) {
  const allMonths = MONTHS.map((month, index) =>
    summarize(
      month,
      trades.filter((trade) => trade.row.entryLegs[0]?.dateTime.getMonth() === index),
    ),
  );
  const rows = allMonths.filter((row) => row.totalTrades > 0);

  return {
    rows,
    total: summarize("Total", trades),
    yearlyAverage: averageMetricRows("Yearly Average", rows),
    quarters: QUARTERS.map((quarter) =>
      averageMetricRows(
        quarter.label,
        quarter.monthIndexes
          .map((monthIndex) => allMonths[monthIndex])
          .filter((row) => row.totalTrades > 0),
      ),
    ).filter((row) => row.totalTrades > 0),
  };
}

export function getClosedTradeYears(rows: GroupedTradeRow[]) {
  return Array.from(
    new Set(
      rows
        .filter((row) => row.derivedStatus === "CLOSED")
        .map((row) => row.entryLegs[0]?.dateTime.getFullYear())
        .filter((year): year is number => typeof year === "number"),
    ),
  ).sort((a, b) => b - a);
}

export function formatSummaryNumber(value: number | null, decimals = 2) {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(decimals);
}

export function formatSummaryPercent(value: number | null, decimals = 1) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatReturnPercent(value: number | null, decimals = 1) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(decimals)}%`;
}

export function formatSummaryDate(date: Date) {
  return format(date, "dd MMM yyyy");
}
