/**
 * /r-multiple — the journal measured in risk rather than rupees.
 *
 * The journal and the summary both answer "how much did I make". This answers
 * "how good were the trades", which is a different question: a ₹40,000 win on a
 * position risking ₹40,000 is a 1R trade, and so is a ₹400 win on ₹400. Sizing
 * flatters the first one; R does not.
 *
 * Deliberately its own page rather than another dashboard card - it is read
 * end-to-end when reviewing a stretch of trading, not glanced at.
 */

import { Target } from "lucide-react";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildGroupedJournalRows } from "@/lib/trade-utils";
import { buildSummaryTrades } from "@/lib/journal-summary";
import { RMultipleChart, type RTrade } from "@/components/r-multiple-chart";
import { RMultipleRange } from "@/components/r-multiple-range";
import {
  RANGE_PRESETS,
  DEFAULT_RANGE_KEY,
  monthBounds,
  recentMonths,
  type MonthOption,
} from "@/lib/r-range";

type Props = {
  searchParams: { range?: string; from?: string; to?: string; open?: string; m?: string };
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Sortable, comparable month key - the identity the chart groups the run by. */
function monthKey(date: Date | null) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Midnight local, so a day picked in the UI includes everything traded that day. */
function startOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function endOfDay(value: string) {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * The window to chart, from the URL.
 *
 * Falls back to 3 months rather than to everything: an R chart of several
 * hundred trades is a texture, not something you can read a single bar off,
 * and the recent stretch is what a review is usually about.
 */
function resolveRange(params: Props["searchParams"], months: MonthOption[]) {
  const from = params.from && DATE_RE.test(params.from) ? params.from : null;
  const to = params.to && DATE_RE.test(params.to) ? params.to : null;

  if (params.range === "custom" && from && to) {
    return { key: "custom", start: startOfDay(from), end: endOfDay(to), from, to, month: "" };
  }

  // A single calendar month, named on its own button.
  if (params.range === "month" && params.m) {
    const bounds = monthBounds(params.m);
    // Only the months actually offered - an arbitrary ?m= would otherwise chart
    // a window with no button to show it as selected.
    if (bounds && months.some((option) => option.key === params.m)) {
      return {
        key: "month",
        start: bounds.start,
        end: bounds.end,
        from: "",
        to: "",
        month: params.m,
      };
    }
  }

  const preset =
    RANGE_PRESETS.find((option) => option.key === params.range) ??
    RANGE_PRESETS.find((option) => option.key === DEFAULT_RANGE_KEY)!;

  if (preset.days === null) {
    return { key: preset.key, start: null, end: null, from: "", to: "", month: "" };
  }

  const start = new Date();
  start.setDate(start.getDate() - preset.days);
  start.setHours(0, 0, 0, 0);

  return { key: preset.key, start, end: null, from: "", to: "", month: "" };
}

export default async function RMultiplePage({ searchParams }: Props) {
  const user = await requireActiveUser();

  const [rawTrades, userData] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user.id },
      orderBy: { firstEntryAt: "desc" },
      take: 5000,
      include: { transactions: { orderBy: { dateTime: "asc" as const } } },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { portfolioCapital: true },
    }),
  ]);

  const capital = userData?.portfolioCapital ?? 100000;
  const groupedRows = buildGroupedJournalRows(rawTrades, capital);
  // Resolved once on the server so both the picker and the filter agree on
  // which three months "the last three months" means.
  const months = recentMonths(new Date());
  const range = resolveRange(searchParams, months);

  // Filtered on entry date, matching how the sequence is numbered - a trade
  // belongs to the window it was opened in, not the one it happened to close in.
  const rows = groupedRows.filter((row) => {
    const entry = row.entryLegs[0]?.dateTime;
    if (!entry) return false;
    if (range.start && entry < range.start) return false;
    if (range.end && entry > range.end) return false;
    return true;
  });

  // Counted across the whole journal, so an empty window can point at them.
  const totalClosed = groupedRows.filter((row) => row.derivedStatus === "CLOSED").length;

  const ids = new Set(rows.map((row) => row.id));

  // Open trades are in by default, marked out as live rather than settled. Their
  // R is marked to market, so it moves with the price and is not yet a result -
  // which is why they carry their own colour, their own count in the stats, and
  // a switch to leave them out when the question is only about finished trades.
  const includeOpen = searchParams.open !== "0";
  const summaryTrades = buildSummaryTrades(
    rows,
    rawTrades.filter((trade) => ids.has(trade.id)),
    { includeOpen },
  );

  const trades: RTrade[] = summaryTrades
    .map((trade) => ({
      id: trade.row.id,
      symbol: trade.row.symbol,
      isOpen: trade.isOpen,
      entryAt: trade.row.entryLegs[0]?.dateTime ?? null,
      entryDate:
        trade.row.entryLegs[0]?.dateTime.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        }) ?? "—",
      // The month the trade was entered in, so the chart can rule the sequence
      // off into months and start counting again at each one.
      month: monthKey(trade.row.entryLegs[0]?.dateTime ?? null),
      monthLabel:
        trade.row.entryLegs[0]?.dateTime.toLocaleDateString("en-IN", {
          month: "short",
          year: "2-digit",
        }) ?? "—",
      r: Number(trade.grossR.toFixed(2)),
      pnl: trade.pnlAmount,
      stopLossPct: trade.stopLossPct,
      assumedStop: trade.usedDefaultStopLoss,
      // Capital committed at entry, not what is still open: a trade that has
      // been half sold was still sized at its full weight when it was taken,
      // and closed trades have no open capital at all.
      allocPct: capital > 0 ? (trade.row.capital / capital) * 100 : 0,
      setups: trade.setups,
    }))
    // Oldest first: the sequence is the point, and the query returns newest first.
    .sort((a, b) => (a.entryAt?.getTime() ?? 0) - (b.entryAt?.getTime() ?? 0))
    .map(({ entryAt: _entryAt, ...trade }) => trade);

  const rangeLabel =
    range.key === "custom"
      ? `${range.from} to ${range.to}`
      : range.key === "month"
        ? (months.find((option) => option.key === range.month)?.label ?? "month")
        : range.key === "all"
          ? "journal"
          : `last ${RANGE_PRESETS.find((option) => option.key === range.key)?.label ?? ""}`;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
            <Target className="h-5 w-5 text-accent" />
            R-Multiples
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every trade as a multiple of what it risked. Height is how good the trade was,
            with position size taken out; colour puts it back, as the share of the portfolio
            the trade was given at entry. Open positions count at their marked-to-market
            value and are drawn hatched.
          </p>
        </div>

        <RMultipleRange
          active={range.key}
          from={range.from}
          to={range.to}
          months={months}
          activeMonth={range.month}
        />
      </section>

      <RMultipleChart
        trades={trades}
        rangeLabel={rangeLabel}
        totalClosed={totalClosed}
        includeOpen={includeOpen}
        rangeKey={range.key}
        from={range.from}
        to={range.to}
        month={range.month}
      />
    </div>
  );
}
