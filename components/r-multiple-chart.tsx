"use client";

/**
 * R-multiples, trade by trade.
 * ─────────────────────────────────────────────────────────────────────
 * One bar per closed trade: how many multiples of the money it risked the
 * trade returned. Above the line is a winner, below it a loser, and the height
 * is the only thing that matters - a journal with a 40% win rate is fine if the
 * bars above the line are three times the height of the ones below.
 *
 * Colour is deliberately redundant here. Sign is already carried by which side
 * of the zero line a bar sits on, which is why the house green/red pair is kept
 * (ΔE 5.1 under deuteranopia - unreadable as the *only* cue, fine as a second
 * one) rather than swapped for a colourblind-safe pair that would disagree with
 * every other P&L figure in the app. The table view carries the numbers for
 * anyone the colours fail.
 * ─────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { Table2, BarChart3, Eye, EyeOff } from "lucide-react";
import { SymbolChartLink } from "@/components/symbol-chart-link";

const PROFIT = "#157f5b";
const LOSS = "#b33f40";
/**
 * Open trades get their own light green, whichever way they are running.
 *
 * It takes the colour channel outright, so the assumed-stop tint that used to
 * live here is gone: it was a pale green too, and with most of a journal
 * carrying an assumed stop the two were indistinguishable. That fact is still
 * on every tooltip and in the table, where it can be read rather than guessed
 * at. Sign stays legible either way - it is which side of the zero line the bar
 * sits on, not its colour.
 */
const OPEN = "#5cb894";
const INK = "#0f1720";
const MUTED = "#6b7280";
const GRID = "#e4e7e4";

export type RTrade = {
  id: string;
  symbol: string;
  /** Still running: its R is marked to market and will move. */
  isOpen: boolean;
  entryDate: string;
  r: number;
  pnl: number;
  stopLossPct: number;
  assumedStop: boolean;
  setups: string[];
};

const fmtR = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}R`;

const fmtMoney = (value: number) =>
  `${value < 0 ? "-" : ""}₹${Math.abs(Math.round(value)).toLocaleString("en-IN")}`;

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "profit" | "loss";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted">{hint}</p>}
    </div>
  );
}

export function RMultipleChart({
  trades,
  rangeLabel,
  totalClosed = 0,
  includeOpen = true,
  rangeKey = "3m",
  from = "",
  to = "",
  month = "",
}: {
  trades: RTrade[];
  /** Named so an empty chart can say what window it is empty for. */
  rangeLabel?: string;
  /** Closed trades in the whole journal, so an empty window can offer a way out. */
  totalClosed?: number;
  includeOpen?: boolean;
  /** Carried so the open-trades switch can rebuild the URL without losing the range. */
  rangeKey?: string;
  from?: string;
  to?: string;
  month?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  /** Keeps the date range while flipping the open-trades switch. */
  const rangeHref = (nextIncludeOpen: boolean) => {
    const params = new URLSearchParams({ range: rangeKey });
    if (rangeKey === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    if (rangeKey === "month") params.set("m", month);
    if (!nextIncludeOpen) params.set("open", "0");
    return `/r-multiple?${params.toString()}`;
  };

  const stats = useMemo(() => {
    const wins = trades.filter((trade) => trade.r > 0);
    const losses = trades.filter((trade) => trade.r < 0);
    const totalR = trades.reduce((sum, trade) => sum + trade.r, 0);
    const avgWin = wins.length
      ? wins.reduce((sum, trade) => sum + trade.r, 0) / wins.length
      : 0;
    const avgLoss = losses.length
      ? Math.abs(losses.reduce((sum, trade) => sum + trade.r, 0) / losses.length)
      : 0;

    return {
      totalR,
      expectancy: trades.length ? totalR / trades.length : 0,
      winPct: trades.length ? (wins.length / trades.length) * 100 : 0,
      wins: wins.length,
      losses: losses.length,
      // Seeding these with 0 would report a journal of pure losses as having a
      // best trade of 0.00R, and a journal with no losses as having a worst of
      // 0.00R in loss-red. Neither trade exists; say so.
      best: wins.length ? Math.max(...wins.map((trade) => trade.r)) : null,
      worst: losses.length ? Math.min(...losses.map((trade) => trade.r)) : null,
      // The ratio the win rate has to clear. A 2.0 payoff only needs to be right
      // a third of the time to break even, which is the whole argument for
      // reading a journal in R rather than in rupees.
      payoff: avgLoss > 0 ? avgWin / avgLoss : null,
      assumed: trades.filter((trade) => trade.assumedStop).length,
      open: trades.filter((trade) => trade.isOpen).length,
    };
  }, [trades]);

  /**
   * The y-axis always spans at least -1R to +1R.
   *
   * Those two lines are the reference the whole chart is read against, so they
   * have to be on it even when no trade reached them - a clean run of winners
   * would otherwise start the axis at 0R and quietly drop the -1R line, which
   * is exactly the view where "none of these hit the stop" is the point being
   * made. The headroom keeps the edge labels off the axis line.
   */
  const domain = useMemo<[number, number]>(() => {
    const values = trades.map((trade) => trade.r);
    const low = Math.min(-1, ...values);
    const high = Math.max(1, ...values);
    const pad = Math.max(0.35, (high - low) * 0.06);
    return [low - pad, high + pad];
  }, [trades]);

  /** Bars carry their sequence number, which is what the axis shows. */
  const bars = useMemo(
    () => trades.map((trade, index) => ({ ...trade, n: index + 1 })),
    [trades],
  );

  const cumulative = useMemo(() => {
    let running = 0;
    return bars.map((trade) => {
      running += trade.r;
      return { n: trade.n, cumR: Number(running.toFixed(2)), symbol: trade.symbol };
    });
  }, [bars]);

  /** Counts per whole-R bucket, so the shape of the edge is visible at a glance. */
  const distribution = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const trade of trades) {
      // Losses floor, wins ceil, so nothing lands in a "0R" bucket that would
      // mix the two sides of the line.
      const bucket = trade.r < 0 ? Math.floor(trade.r) : Math.ceil(trade.r);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    // Every bucket between the extremes, including the empty ones. Dropping
    // them closes the gaps and turns a barbell into a tidy little staircase -
    // the distribution's shape is the entire point of the chart.
    const keys = [...buckets.keys()];
    const low = Math.min(...keys);
    const high = Math.max(...keys);
    const span: number[] = [];
    for (let bucket = low; bucket <= high; bucket++) {
      // No 0R bucket exists: losses floor and wins ceil, so nothing rounds to it.
      if (bucket !== 0) span.push(bucket);
    }

    return span.map((bucket) => ({
      bucket,
      label: bucket < 0 ? `${bucket}R` : `+${bucket}R`,
      count: buckets.get(bucket) ?? 0,
    }));
  }, [trades]);

  if (trades.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-8 text-center">
        <p className="text-sm text-muted">
          No closed trades {rangeLabel ? `in the ${rangeLabel}` : "yet"}. R-multiples need
          an exit &mdash; and a stop, to measure the exit against.
        </p>
        {/* An empty window on a journal that is not empty is a date problem, not
            a trading one, so say where the trades actually are. */}
        {totalClosed > 0 && (
          <Link
            href="/r-multiple?range=all"
            className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
          >
            Show all {totalClosed} closed trades &rarr;
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline numbers. Expectancy leads: it is the one number that says
          whether the whole journal is worth repeating. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Expectancy"
          value={fmtR(stats.expectancy)}
          hint="per trade"
          tone={stats.expectancy > 0 ? "profit" : stats.expectancy < 0 ? "loss" : "neutral"}
        />
        <Stat
          label="Total"
          value={fmtR(stats.totalR)}
          hint={
            stats.open > 0
              ? `over ${trades.length} trades · ${stats.open} still open`
              : `over ${trades.length} trade${trades.length === 1 ? "" : "s"}`
          }
          tone={stats.totalR > 0 ? "profit" : stats.totalR < 0 ? "loss" : "neutral"}
        />
        <Stat
          label="Win rate"
          value={`${stats.winPct.toFixed(0)}%`}
          hint={`${stats.wins}W / ${stats.losses}L`}
        />
        <Stat
          label="Payoff"
          value={stats.payoff ? `${stats.payoff.toFixed(2)}×` : "—"}
          hint={stats.payoff ? `breakeven at ${(100 / (1 + stats.payoff)).toFixed(0)}% wins` : "no losses yet"}
        />
        <Stat
          label="Best"
          value={stats.best === null ? "—" : fmtR(stats.best)}
          hint={stats.best === null ? "no winners yet" : undefined}
          tone={stats.best === null ? "neutral" : "profit"}
        />
        <Stat
          label="Worst"
          value={stats.worst === null ? "—" : fmtR(stats.worst)}
          hint={stats.worst === null ? "no losses yet" : undefined}
          tone={stats.worst === null ? "neutral" : "loss"}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PROFIT }} />
            Winner
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LOSS }} />
            Loser
          </span>
          {stats.open > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OPEN }} />
              Open, marked to market ({stats.open})
            </span>
          )}
          {stats.assumed > 0 && (
            <span className="text-muted">{stats.assumed} with an assumed stop</span>
          )}
        </div>

        <div className="flex items-center gap-2">
        <Link
          href={rangeHref(!includeOpen)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition ${
            includeOpen
              ? "border-accent bg-accent/10 text-accentDeep"
              : "border-line bg-white text-slate-600 hover:bg-canvas"
          }`}
        >
          {includeOpen ? <Eye size={14} /> : <EyeOff size={14} />}
          Open trades
        </Link>

        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-[11px] text-slate-600 transition hover:bg-canvas"
        >
          {view === "chart" ? <Table2 size={14} /> : <BarChart3 size={14} />}
          {view === "chart" ? "Table" : "Chart"}
        </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Entry</th>
                <th className="px-3 py-2 text-right font-medium">Stop</th>
                <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
                <th className="px-3 py-2 text-right font-medium">R</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((trade) => (
                <tr key={trade.id} className="border-b border-line/50">
                  <td className="px-3 py-1.5 text-muted">{trade.n}</td>
                  <td className="px-3 py-1.5">
                    <SymbolChartLink symbol={trade.symbol} asTicker className="font-medium text-ink" />
                    {trade.isOpen && (
                      <span className="ml-1.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        open
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{trade.entryDate}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                    {trade.stopLossPct.toFixed(1)}%{trade.assumedStop ? "*" : ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(trade.pnl)}</td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                      trade.r > 0 ? "text-profit" : trade.r < 0 ? "text-loss" : ""
                    }`}
                  >
                    {fmtR(trade.r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.assumed > 0 && (
            <p className="px-3 py-2 text-[11px] text-muted">
              * stop was not recorded, so a 3% stop is assumed and the R is an estimate.
            </p>
          )}
        </div>
      ) : (
        <>
          <figure className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
            <figcaption className="mb-1 px-1">
              <h3 className="text-sm font-semibold text-ink">Every trade in R</h3>
              <p className="text-[11px] text-muted">
                In the order they were entered. The dashed line is expectancy &mdash;{" "}
                {fmtR(stats.expectancy)} per trade.
              </p>
            </figcaption>
            <div className="h-[300px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 8, right: 26, left: -18, bottom: 4 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="n"
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={{ stroke: GRID }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    domain={domain}
                    tickFormatter={(value: number) => `${Math.round(value)}R`}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(15,23,32,0.04)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const trade = payload[0].payload as RTrade & { n: number };
                      return (
                        <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-xs shadow-soft">
                          <p className="font-semibold text-ink">
                            #{trade.n} {trade.symbol}
                          </p>
                          <p className="text-muted">{trade.entryDate}</p>
                          <p
                            className={`mt-1 font-mono font-semibold ${
                              trade.r > 0 ? "text-profit" : "text-loss"
                            }`}
                          >
                            {fmtR(trade.r)} · {fmtMoney(trade.pnl)}
                          </p>
                          <p className="text-[11px] text-muted">
                            {trade.stopLossPct.toFixed(1)}% stop
                            {trade.assumedStop ? " (assumed)" : ""}
                          </p>
                          {trade.isOpen && (
                            <p className="text-[11px] font-medium text-warning">
                              Still open &mdash; marked to market
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* The two lines a trade is actually judged against: -1R is a
                      stop taken in full, +1R is the first target. Anything
                      below -1R is a stop that was not honoured. */}
                  <ReferenceLine
                    y={1}
                    stroke={PROFIT}
                    strokeOpacity={0.45}
                    strokeDasharray="2 3"
                    strokeWidth={1}
                    label={{
                      value: "+1R",
                      position: "right",
                      fontSize: 9,
                      fill: PROFIT,
                    }}
                  />
                  <ReferenceLine
                    y={-1}
                    stroke={LOSS}
                    strokeOpacity={0.45}
                    strokeDasharray="2 3"
                    strokeWidth={1}
                    label={{
                      value: "-1R",
                      position: "right",
                      fontSize: 9,
                      fill: LOSS,
                    }}
                  />
                  {/* Zero last of the three, so it reads as the baseline. */}
                  <ReferenceLine y={0} stroke={INK} strokeWidth={1} />
                  <ReferenceLine
                    y={stats.expectancy}
                    stroke={stats.expectancy >= 0 ? PROFIT : LOSS}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                  <Bar dataKey="r" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                    {bars.map((trade) => (
                      <Cell
                        key={trade.id}
                        fill={trade.isOpen ? OPEN : trade.r >= 0 ? PROFIT : LOSS}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <div className="grid gap-4 lg:grid-cols-2">
            <figure className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
              <figcaption className="mb-1 px-1">
                <h3 className="text-sm font-semibold text-ink">Cumulative R</h3>
                <p className="text-[11px] text-muted">
                  The same trades added up &mdash; the equity curve with position size taken out
                  of it.
                </p>
              </figcaption>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulative} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="n"
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={12}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(value: number) => `${value}R`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as { n: number; cumR: number; symbol: string };
                        return (
                          <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-xs shadow-soft">
                            <p className="font-semibold text-ink">
                              After #{point.n} {point.symbol}
                            </p>
                            <p className="font-mono text-muted">{fmtR(point.cumR)}</p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke={INK} strokeWidth={1} />
                    <Line
                      type="monotone"
                      dataKey="cumR"
                      stroke={stats.totalR >= 0 ? PROFIT : LOSS}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>

            <figure className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
              <figcaption className="mb-1 px-1">
                <h3 className="text-sm font-semibold text-ink">Where the trades land</h3>
                <p className="text-[11px] text-muted">
                  Count per whole R. A healthy shape is a wall at &minus;1R and a long tail
                  to the right.
                </p>
              </figcaption>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(15,23,32,0.04)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as { label: string; count: number };
                        return (
                          <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-xs shadow-soft">
                            <p className="font-semibold text-ink">{point.label}</p>
                            <p className="text-muted">
                              {point.count} trade{point.count === 1 ? "" : "s"}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={38} isAnimationActive={false}>
                      {distribution.map((bucket) => (
                        <Cell key={bucket.label} fill={bucket.bucket >= 0 ? PROFIT : LOSS} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>
          </div>
        </>
      )}
    </div>
  );
}
