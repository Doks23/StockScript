import Link from "next/link";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildGroupedJournalRows } from "@/lib/trade-utils";
import {
  BREAKEVEN_BAND_PRESETS,
  buildSummaryTrades,
  buildMonthlySummary,
  buildSetupSummary,
  formatReturnPercent,
  formatSummaryNumber,
  formatSummaryPercent,
  formatBreakevenBand,
  getTradeYears,
  resolveBreakevenBand,
  summarize,
  type SummaryMetricRow,
} from "@/lib/journal-summary";

type Props = {
  searchParams: {
    tab?: string;
    year?: string;
    be?: string;
  };
};

/** Every link on this page has to carry the whole view, or a click silently resets it. */
function summaryHref({ tab, year, band }: { tab: string; year: number; band: number }) {
  return `/summary?tab=${tab}&year=${year}&be=${formatBreakevenBand(band)}`;
}

const MONTH_COLUMNS = [
  { key: "totalTrades", label: "Trades", align: "right" as const },
  { key: "openTrades", label: "Open", align: "right" as const },
  { key: "wins", label: "Wins", align: "right" as const },
  { key: "losses", label: "Losses", align: "right" as const },
  { key: "breakeven", label: "Breakeven", align: "right" as const },
  { key: "winPct", label: "Win %", align: "right" as const },
  { key: "portfolioReturnPct", label: "Portfolio %", align: "right" as const },
  { key: "winAverage", label: "Avg Win", align: "right" as const },
  { key: "lossAverage", label: "Avg Loss", align: "right" as const },
  { key: "avgStopLossPct", label: "Avg SL", align: "right" as const },
  { key: "simpleRR", label: "RR", align: "right" as const },
  { key: "grossR", label: "Gross R", align: "right" as const },
  { key: "netR", label: "Net R", align: "right" as const },
  { key: "maxWin", label: "Best", align: "right" as const },
  { key: "maxLoss", label: "Worst", align: "right" as const },
  { key: "maxR", label: "Max R", align: "right" as const },
  { key: "avgWinDays", label: "Avg Win D", align: "right" as const },
  { key: "avgLossDays", label: "Avg Loss D", align: "right" as const },
  // The stop-loss split is reference material, not a result, so it sits after
  // the columns the month is actually judged on.
  { key: "avgWinStopLossPct", label: "Avg SL Win", align: "right" as const },
  { key: "avgLossStopLossPct", label: "Avg SL Loss", align: "right" as const },
] as const;

const YEAR_COLUMNS = [
  { key: "totalTrades", label: "Trades", align: "right" as const },
  { key: "wins", label: "Wins", align: "right" as const },
  { key: "losses", label: "Losses", align: "right" as const },
  { key: "breakeven", label: "Breakeven", align: "right" as const },
  { key: "winPct", label: "Win %", align: "right" as const },
  { key: "winAverage", label: "Avg Win", align: "right" as const },
  { key: "lossAverage", label: "Avg Loss", align: "right" as const },
  { key: "avgStopLossPct", label: "Avg SL", align: "right" as const },
  { key: "avgWinStopLossPct", label: "Avg SL Win", align: "right" as const },
  { key: "avgLossStopLossPct", label: "Avg SL Loss", align: "right" as const },
  { key: "simpleRR", label: "RR", align: "right" as const },
  { key: "netR", label: "Net R", align: "right" as const },
  { key: "maxR", label: "Max R", align: "right" as const },
] as const;

const LOSS_METRICS = new Set(["lossAverage"]);
const PCT_COLS = new Set([
  "winPct",
  "winAverage",
  "maxWin",
  "maxLoss",
  "returnPct",
  "portfolioReturnPct",
]);
const R_COLS = new Set(["grossR", "netR", "simpleRR", "awlr", "maxR"]);
// Stop-loss width is neither good nor bad on its own, so it stays off the P&L palette.
const SL_COLS = new Set(["avgStopLossPct", "avgWinStopLossPct", "avgLossStopLossPct"]);

function pnlClass(value: number | null) {
  if (value === null) return "text-slate-400";
  return value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-slate-400";
}

function cellColor(columnKey: string, value: number | null) {
  if (SL_COLS.has(columnKey)) return "text-amber-600";
  if (columnKey === "breakeven" || columnKey === "openTrades") {
    return value ? "text-slate-500" : "text-slate-300";
  }
  if (LOSS_METRICS.has(columnKey)) return "text-red-500";
  if (PCT_COLS.has(columnKey) || R_COLS.has(columnKey)) return pnlClass(value);
  return "text-slate-700";
}

function DirectionIcon({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <Minus className={`h-3.5 w-3.5 text-slate-300 ${className ?? ""}`} />;
  return value > 0
    ? <TrendingUp className={`h-3.5 w-3.5 text-emerald-500 ${className ?? ""}`} />
    : <TrendingDown className={`h-3.5 w-3.5 text-red-400 ${className ?? ""}`} />;
}

function metricValue(row: SummaryMetricRow, key: string) {
  switch (key) {
    case "grossR":
    case "netR":
    case "simpleRR":
    case "maxR":
    case "minR":
      return formatSummaryNumber((row as any)[key]);
    case "totalTrades":
    case "defaultStopLossTrades":
    case "wins":
    case "losses":
    case "breakeven":
    case "openTrades":
      return (row as any)[key].toLocaleString("en-IN");
    case "winPct":
      return formatSummaryPercent((row as any).winPct);
    case "winAverage":
    case "lossAverage":
    case "maxWin":
    case "maxLoss":
    case "avgStopLossPct":
    case "avgWinStopLossPct":
    case "avgLossStopLossPct":
    case "returnPct":
    case "portfolioReturnPct":
      return formatReturnPercent((row as any)[key]);
    case "avgWinDays":
    case "avgLossDays":
      return formatSummaryNumber((row as any)[key]);
  }
  return "-";
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${color ?? "text-slate-700"}`}>{value}</span>
    </div>
  );
}

function QuarterCard({ row }: { row: SummaryMetricRow }) {
  const isPositive = row.netR > 0;
  const isNegative = row.netR < 0;
  const borderColor = isPositive
    ? "border-emerald-200"
    : isNegative
      ? "border-red-200"
      : "border-slate-200";
  const bgAccent = isPositive
    ? "bg-emerald-50"
    : isNegative
      ? "bg-red-50"
      : "bg-slate-50";

  return (
    <div className={`rounded-xl border ${borderColor} ${bgAccent} p-3.5 space-y-2.5`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-800">{row.label}</span>
        <DirectionIcon value={row.netR} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <MiniStat label="Net R" value={formatSummaryNumber(row.netR)} color={pnlClass(row.netR)} />
        <MiniStat
          label="Portfolio %"
          value={formatReturnPercent(row.portfolioReturnPct)}
          color={pnlClass(row.portfolioReturnPct)}
        />
        <MiniStat label="Trades" value={row.totalTrades.toLocaleString("en-IN")} />
        <MiniStat label="Win %" value={formatSummaryPercent(row.winPct)} />
      </div>
    </div>
  );
}

function MonthlySummaryTable({
  rows,
  total,
  quarterlyCards,
  yearlyAverage,
}: {
  rows: SummaryMetricRow[];
  total: SummaryMetricRow;
  quarterlyCards: SummaryMetricRow[];
  yearlyAverage: SummaryMetricRow;
}) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="min-w-[1800px] w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-slate-100 text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2.5 text-left font-semibold">Month</th>
              {MONTH_COLUMNS.map((column) => (
                <th key={column.key} className={`px-3 py-2.5 text-${column.align} font-semibold whitespace-nowrap`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isPositive = row.netR > 0;
              const isNegative = row.netR < 0;
              const rowBg = isPositive ? "bg-emerald-50/30" : isNegative ? "bg-red-50/30" : "";
              return (
                <tr key={row.label} className={`border-b border-slate-100 ${rowBg} hover:bg-slate-50/80`}>
                  <th className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-medium text-slate-700 whitespace-nowrap">
                    {row.label}
                  </th>
                  {MONTH_COLUMNS.map((column) => {
                    const raw = (row as any)[column.key];
                    const color = cellColor(column.key, raw);
                    return (
                      <td key={column.key} className={`px-3 py-2 text-right tabular-nums font-medium ${color}`}>
                        {metricValue(row, column.key)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-ink">
              <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2.5 text-left">Total</th>
              {MONTH_COLUMNS.map((column) => {
                const raw = (total as any)[column.key];
                const color = cellColor(column.key, raw);
                return (
                  <td key={column.key} className={`px-3 py-3 text-right tabular-nums ${color}`}>
                    {metricValue(total, column.key)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {quarterlyCards.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Quarterly Breakdown</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quarterlyCards.map((q) => (
              <QuarterCard key={q.label} row={q} />
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-slate-700">Yearly Average</span>
              <DirectionIcon value={yearlyAverage.netR} />
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <MiniStat label="Net R" value={formatSummaryNumber(yearlyAverage.netR)} color={pnlClass(yearlyAverage.netR)} />
              <MiniStat label="Trades" value={yearlyAverage.totalTrades.toLocaleString("en-IN")} />
              <MiniStat label="Win %" value={formatSummaryPercent(yearlyAverage.winPct)} />
              <MiniStat label="Breakeven" value={yearlyAverage.breakeven.toLocaleString("en-IN")} color="text-slate-500" />
              <MiniStat label="RR" value={formatSummaryNumber(yearlyAverage.simpleRR)} />
              <MiniStat label="Avg Win" value={formatReturnPercent(yearlyAverage.winAverage)} />
              <MiniStat label="Avg Loss" value={formatReturnPercent(yearlyAverage.lossAverage)} />
              <MiniStat label="Avg SL" value={formatReturnPercent(yearlyAverage.avgStopLossPct)} color="text-amber-600" />
              <MiniStat
                label="Portfolio %"
                value={formatReturnPercent(yearlyAverage.portfolioReturnPct)}
                color={pnlClass(yearlyAverage.portfolioReturnPct)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupSummaryTable({
  rows,
  total,
  labelHeader,
}: {
  rows: SummaryMetricRow[];
  total: SummaryMetricRow;
  labelHeader: string;
}) {
  const SETUP_COLUMNS = [
    { key: "totalTrades", label: "Trades", align: "right" as const },
    { key: "openTrades", label: "Open", align: "right" as const },
    { key: "defaultStopLossTrades", label: "Default SL", align: "right" as const },
    { key: "wins", label: "Wins", align: "right" as const },
    { key: "losses", label: "Losses", align: "right" as const },
    { key: "breakeven", label: "Breakeven", align: "right" as const },
    { key: "winPct", label: "Win %", align: "right" as const },
    { key: "portfolioReturnPct", label: "Portfolio %", align: "right" as const },
    { key: "winAverage", label: "Avg Win", align: "right" as const },
    { key: "lossAverage", label: "Avg Loss", align: "right" as const },
    { key: "avgStopLossPct", label: "Avg SL", align: "right" as const },
    { key: "simpleRR", label: "RR", align: "right" as const },
    { key: "awlr", label: "AWLR", align: "right" as const },
    { key: "grossR", label: "Gross R", align: "right" as const },
    { key: "netR", label: "Net R", align: "right" as const },
    { key: "maxR", label: "Max R", align: "right" as const },
    { key: "avgWinDays", label: "Avg Win D", align: "right" as const },
    { key: "avgLossDays", label: "Avg Loss D", align: "right" as const },
    // Same as the monthly table: the stop-loss split trails the results.
    { key: "avgWinStopLossPct", label: "Avg SL Win", align: "right" as const },
    { key: "avgLossStopLossPct", label: "Avg SL Loss", align: "right" as const },
  ] as const;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="min-w-[1800px] w-full text-xs">
        <thead>
          <tr className="border-b border-line bg-slate-100 text-slate-600">
            <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2.5 text-left font-semibold">
              {labelHeader}
            </th>
            {SETUP_COLUMNS.map((column) => (
              <th key={column.key} className={`px-3 py-2.5 text-${column.align} font-semibold whitespace-nowrap`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasDefaultSL = row.defaultStopLossTrades > 0;
            return (
              <tr
                key={row.label}
                className={`border-b border-slate-100 odd:bg-white even:bg-slate-50 hover:bg-slate-100/50 ${
                  hasDefaultSL ? "shadow-[inset_3px_0_0_#f59e0b]" : ""
                }`}
              >
                <th className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-medium text-slate-700 whitespace-nowrap">
                  {row.label}
                </th>
                {SETUP_COLUMNS.map((column) => {
                  const raw = (row as any)[column.key];
                  const color = cellColor(column.key, raw);
                  const slHighlight = column.key === "defaultStopLossTrades" && hasDefaultSL
                    ? "bg-amber-50 font-semibold text-amber-700"
                    : "";
                  return (
                    <td key={column.key} className={`px-3 py-2 text-right tabular-nums ${color} ${slHighlight}`}>
                      {metricValue(row, column.key)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-ink">
            <th className="sticky left-0 z-10 bg-slate-100 px-3 py-3 text-left">Total</th>
            {SETUP_COLUMNS.map((column) => {
              const raw = (total as any)[column.key];
              const color = cellColor(column.key, raw);
              return (
                <td key={column.key} className={`px-3 py-3 text-right tabular-nums ${color}`}>
                  {metricValue(total, column.key)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function YearComparisonRow({
  year,
  row,
  isActive,
  band,
}: {
  year: number;
  row: SummaryMetricRow;
  isActive: boolean;
  band: number;
}) {
  const isPositive = row.netR > 0;
  const isNegative = row.netR < 0;
  const borderColor = isActive ? "border-accent" : "border-transparent hover:border-slate-300";

  return (
    <Link
      href={summaryHref({ tab: "monthly", year, band })}
      className={`block rounded-xl border-2 ${borderColor} bg-white p-3 transition ${isActive ? "shadow-sm" : "hover:shadow-sm"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-bold text-slate-800">{year}</span>
        <DirectionIcon value={row.netR} />
      </div>
      <div className="grid grid-cols-5 gap-2 text-xs">
        <MiniStat label="Net R" value={formatSummaryNumber(row.netR)} color={pnlClass(row.netR)} />
        <MiniStat
          label="Portfolio %"
          value={formatReturnPercent(row.portfolioReturnPct)}
          color={pnlClass(row.portfolioReturnPct)}
        />
        <MiniStat label="Trades" value={row.totalTrades.toLocaleString("en-IN")} />
        <MiniStat label="Win %" value={formatSummaryPercent(row.winPct)} />
        <MiniStat label="RR" value={formatSummaryNumber(row.simpleRR)} />
      </div>
    </Link>
  );
}

export default async function TradeSummaryPage({ searchParams }: Props) {
  const user = await requireActiveUser();
  const activeTab = searchParams.tab === "setup" ? "setup" : "monthly";
  const breakevenBand = resolveBreakevenBand(searchParams.be);
  const bandOptions = Array.from(new Set([...BREAKEVEN_BAND_PRESETS, breakevenBand])).sort(
    (a, b) => a - b,
  );

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
  const years = getTradeYears(groupedRows);
  const requestedYear = searchParams.year ? Number(searchParams.year) : null;
  const selectedYear =
    requestedYear && years.includes(requestedYear) ? requestedYear : years[0] ?? new Date().getFullYear();

  const yearlyRows = groupedRows.filter(
    (row) => row.entryLegs[0]?.dateTime.getFullYear() === selectedYear,
  );
  const yearlyIds = new Set(yearlyRows.map((row) => row.id));
  const yearlyTrades = rawTrades.filter((trade) => yearlyIds.has(trade.id));
  const closedTrades = buildSummaryTrades(yearlyRows, yearlyTrades, { includeOpen: true });
  const setupSummary = buildSetupSummary(closedTrades, breakevenBand);
  const monthlySummary = buildMonthlySummary(closedTrades, breakevenBand);
  const activeSummary = activeTab === "monthly" ? monthlySummary : setupSummary;
  const defaultStopLossCount = closedTrades.filter((trade) => trade.usedDefaultStopLoss).length;
  const openTradeCount = setupSummary.total.openTrades;

  const yearSummaries = years.map((year) => {
    const yRows = groupedRows.filter(
      (r) => r.entryLegs[0]?.dateTime.getFullYear() === year,
    );
    const yIds = new Set(yRows.map((r) => r.id));
    const yTrades = rawTrades.filter((t) => yIds.has(t.id));
    const closed = buildSummaryTrades(yRows, yTrades, { includeOpen: true });
    return { year, summary: summarize(`${year}`, closed, breakevenBand) };
  });

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 sm:text-sm">Analytics</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:mt-2 sm:text-4xl">
            Trade Summary
          </h1>
        </div>
        <Link
          href="/trades"
          className="inline-flex items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-accent hover:text-accent"
        >
          Back to Journal
        </Link>
      </section>

      {years.length > 1 && (
        <section className="rounded-2xl border border-line bg-panel p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Year-over-Year
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {yearSummaries.map(({ year, summary }) => (
              <YearComparisonRow
                key={year}
                year={year}
                row={summary}
                isActive={year === selectedYear}
                band={breakevenBand}
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-panel p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex w-fit gap-1 rounded-2xl border border-line bg-canvas p-1">
            <Link
              href={summaryHref({ tab: "setup", year: selectedYear, band: breakevenBand })}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "setup"
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate-500 hover:text-ink"
              }`}
            >
              Setup Summary
            </Link>
            <Link
              href={summaryHref({ tab: "monthly", year: selectedYear, band: breakevenBand })}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "monthly"
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate-500 hover:text-ink"
              }`}
            >
              Monthly Summary
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Breakeven ±
            </span>
            {bandOptions.map((band) => (
              <Link
                key={band}
                href={summaryHref({ tab: activeTab, year: selectedYear, band })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums transition ${
                  band === breakevenBand
                    ? "bg-slate-700 text-white shadow-sm"
                    : "border border-line bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"
                }`}
              >
                {formatBreakevenBand(band)}%
              </Link>
            ))}
          </div>

          {years.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Year</span>
              {years.map((year) => (
                <Link
                  key={year}
                  href={summaryHref({ tab: activeTab, year, band: breakevenBand })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    year === selectedYear
                      ? "bg-accent text-white shadow-sm"
                      : "border border-line bg-white text-slate-500 hover:border-accent hover:text-accent"
                  }`}
                >
                  {year}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            Open positions included at MTM
          </span>
          <span>
            {closedTrades.length.toLocaleString("en-IN")} trade{closedTrades.length === 1 ? "" : "s"} in{" "}
            <span className="font-semibold text-slate-700">{selectedYear}</span>
            {openTradeCount > 0 && (
              <>
                {" "}· {openTradeCount.toLocaleString("en-IN")} still open
              </>
            )}
          </span>
          <span>
            Gross R = Net P/L % ÷ Stop Loss % · Net R = Gross R × Risk %
          </span>
          <span>
            Portfolio % = P&amp;L ÷ portfolio capital, so the months add up to the year
          </span>
          <span>
            Breakeven = net return within ±{formatBreakevenBand(breakevenBand)}% of capital · Avg SL
            = journal SL % (3% where none was set)
          </span>
          {defaultStopLossCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
              {defaultStopLossCount.toLocaleString("en-IN")} trade
              {defaultStopLossCount === 1 ? "" : "s"} using default 3% stop loss
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-2 shadow-sm sm:p-3">
        {closedTrades.length > 0 ? (
          activeTab === "monthly" ? (
            <MonthlySummaryTable
              rows={monthlySummary.rows}
              total={monthlySummary.total}
              quarterlyCards={monthlySummary.quarters}
              yearlyAverage={monthlySummary.yearlyAverage}
            />
          ) : (
            <SetupSummaryTable
              rows={setupSummary.rows}
              total={setupSummary.total}
              labelHeader="Setup"
            />
          )
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-white py-12 text-center text-sm text-slate-400">
            No closed positions found for {selectedYear}.
          </div>
        )}
      </section>
    </div>
  );
}
