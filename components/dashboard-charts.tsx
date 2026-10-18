"use client";

import { useMemo } from "react";
import type { TradeWithTxns } from "@/lib/trade-utils";
import { getWeightedEntryPrice, getTotalEntryQty, calculateOpenPnl } from "@/lib/trade-utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";
import { formatCurrency, formatPrice, formatPercent } from "@/lib/format";

const PROFIT = "#157f5b";
const LOSS = "#b33f40";
const WARNING = "#d97706";

function computeEquityOffset(
  data: { equity: number }[],
  baseline: number,
) {
  if (!data.length) return 1;
  const values = data.map((d) => d.equity);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max <= baseline) return 0;
  if (min >= baseline) return 1;
  return (max - baseline) / (max - min);
}

export function useEquityCurveData(
  trades: TradeWithTxns[],
  userCapital: number,
) {
  return useMemo(() => {
    const sorted = [...trades].sort(
      (a, b) =>
        new Date(a.firstEntryAt ?? a.createdAt).getTime() -
        new Date(b.firstEntryAt ?? b.createdAt).getTime(),
    );

    let cumulative = 0;
    const curve = sorted.map((t) => {
      const pnl =
        t.status === "CLOSED"
          ? (t.netPnl ?? 0)
          : calculateOpenPnl(t);
      cumulative += pnl;
      return {
        date: new Date(t.firstEntryAt ?? t.createdAt).toLocaleDateString(
          undefined,
          { month: "short", day: "numeric" },
        ),
        equity: userCapital + cumulative,
        pnl: cumulative,
      };
    });

    if (!curve.length) {
      return {
        curve: [{ date: "-", equity: userCapital, pnl: 0 }],
        peak: userCapital,
        current: userCapital,
        maxDrawdownPct: 0,
        maxDrawdownAmt: 0,
        recovery: 100,
        trough: userCapital,
      };
    }

    const equityValues = curve.map((c) => c.equity);
    const peak = Math.max(...equityValues);
    const current = equityValues[equityValues.length - 1];
    const trough = Math.min(...equityValues);

    let runningPeak = equityValues[0];
    let maxDD = 0;
    for (const eq of equityValues) {
      runningPeak = Math.max(runningPeak, eq);
      const dd = runningPeak > 0 ? ((runningPeak - eq) / runningPeak) * 100 : 0;
      maxDD = Math.max(maxDD, dd);
    }
    const maxDrawdownAmt = Math.abs(peak - trough);

    const recovery =
      peak > trough
        ? Math.min(100, ((current - trough) / (peak - trough)) * 100)
        : 100;

    return {
      curve,
      peak,
      current,
      maxDrawdownPct: maxDD,
      maxDrawdownAmt,
      recovery,
      trough,
    };
  }, [trades, userCapital]);
}

export function useMonthlyPnlData(trades: TradeWithTxns[]) {
  return useMemo(() => {
    const sorted = [...trades].sort(
      (a, b) =>
        new Date(a.firstEntryAt ?? a.createdAt).getTime() -
        new Date(b.firstEntryAt ?? b.createdAt).getTime(),
    );

    // Keyed by year and month number, and labelled from a fixed list: the
    // locale's own abbreviations differ ("Sept" in en-GB/en-IN), so sorting or
    // matching on them put September ahead of every other month.
    const MONTH_NAMES = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const monthlyMap = new Map<number, number>();
    sorted.forEach((t) => {
      const d = new Date(t.firstEntryAt ?? t.createdAt);
      const monthKey = d.getFullYear() * 12 + d.getMonth();
      const pnl =
        t.status === "CLOSED"
          ? (t.netPnl ?? 0)
          : t.closingPrice
            ? calculateOpenPnl(t)
            : 0;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + pnl);
    });

    const data = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([monthKey, pnl]) => ({
        month: `${MONTH_NAMES[monthKey % 12]} ${String(Math.floor(monthKey / 12) % 100).padStart(2, "0")}`,
        pnl,
      }))
      .slice(-6);

    const totalPnl = data.reduce((s, d) => s + d.pnl, 0);
    return { data, totalPnl };
  }, [trades]);
}

export function EquityCurveChart({
  equityData,
  showAmounts,
}: {
  equityData: ReturnType<typeof useEquityCurveData>;
  showAmounts: boolean;
}) {
  const { curve, peak, current, maxDrawdownPct, maxDrawdownAmt, recovery } =
    equityData;
  const lastPnl = curve[curve.length - 1]?.pnl ?? 0;
  const startingCapital = current - lastPnl;
  const xAxisInterval = Math.max(0, Math.ceil(curve.length / 7) - 1);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 grid grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-slate-400">Peak</span>
          <p className="font-medium text-ink">
            {showAmounts ? formatCurrency(peak) : "•••"}
          </p>
        </div>
        <div>
          <span className="text-slate-400">Current</span>
          <p className="font-medium text-ink">
            {showAmounts ? formatCurrency(current) : "•••"}
          </p>
        </div>
        <div>
          <span className="text-slate-400">Max DD</span>
          <p className="font-medium text-loss">
            {maxDrawdownPct.toFixed(2)}% /{" "}
            {showAmounts ? formatCurrency(maxDrawdownAmt) : "•••"}
          </p>
        </div>
        <div>
          <span className="text-slate-400">Recovery</span>
          <p
            className={`font-medium ${
              recovery >= 90 ? "text-profit" : recovery >= 50 ? "text-amber-600" : "text-loss"
            }`}
          >
            {recovery.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer width="100%" height={220} minWidth={0}>
          <AreaChart
            data={curve}
            margin={{ top: 2, right: 6, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="equityFill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={PROFIT}
                  stopOpacity={0.2}
                />
                <stop
                  offset={`${computeEquityOffset(curve, startingCapital) * 100}%`}
                  stopColor={PROFIT}
                  stopOpacity={0.02}
                />
                <stop
                  offset={`${computeEquityOffset(curve, startingCapital) * 100}%`}
                  stopColor={LOSS}
                  stopOpacity={0.02}
                />
                <stop
                  offset="100%"
                  stopColor={LOSS}
                  stopOpacity={0.2}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              interval={xAxisInterval}
              minTickGap={18}
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              tickMargin={4}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(val) =>
                showAmounts ? `₹${(val / 1000).toFixed(0)}K` : ""
              }
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              domain={["dataMin - 5000", "dataMax + 5000"]}
            />
            <ReferenceLine
              y={startingCapital}
              stroke="#cbd5e1"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <Tooltip
              formatter={(value: any) =>
                showAmounts ? formatCurrency(Number(value)) : "•••"
              }
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={current >= startingCapital ? PROFIT : LOSS}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#equityFill)"
              baseValue={startingCapital}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MonthlyPnlChart({
  data,
  totalPnl,
  showAmounts,
}: {
  data: { month: string; pnl: number }[];
  totalPnl: number;
  showAmounts: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
          Monthly P&L
        </p>
        <span
          className={`text-xs font-semibold ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}
        >
          {showAmounts ? formatCurrency(totalPnl) : "•••"}
          <span className="ml-1 font-normal text-slate-400">
            Total
          </span>
        </span>
      </div>

      <div className="min-h-[170px] flex-1">
        <ResponsiveContainer width="100%" height={170} minWidth={0}>
          <BarChart
            data={data}
            margin={{ top: 2, right: 2, left: -18, bottom: 0 }}
          >
            <XAxis
              dataKey="month"
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              formatter={(value: any) =>
                showAmounts ? formatCurrency(Number(value)) : "•••"
              }
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            />
            <ReferenceLine y={0} stroke="#e2e5ea" strokeWidth={1} />
            <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={26}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.pnl >= 0 ? PROFIT : LOSS}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PnlDistributionChart({
  winners,
  losers,
  totalTrades,
  avgWin,
  avgLoss,
  largestWin,
  largestLoss,
  showAmounts,
}: {
  winners: number;
  losers: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  showAmounts: boolean;
}) {
  const breakeven = totalTrades - winners - losers;
  const winPct = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;
  const lossPct = totalTrades > 0 ? (losers / totalTrades) * 100 : 0;
  const bePct = totalTrades > 0 ? (breakeven / totalTrades) * 100 : 0;

  const pieData = [
    { name: "Winners", value: winners, color: PROFIT },
    { name: "Losers", value: losers, color: LOSS },
    { name: "Breakeven", value: breakeven, color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
          P&L Distribution
        </p>
        <span className="text-[9px] font-medium text-slate-400">
          {totalTrades} trades
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-2">
        <div className="grid min-h-0 grid-cols-[0.9fr_1.1fr] items-center gap-2">
        <div className="relative h-[150px] min-w-0">
          <ResponsiveContainer width="100%" height={150} minWidth={0}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={56}
                stroke="none"
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [
                  `${value} (${
                    name === "Winners"
                      ? winPct.toFixed(1)
                      : name === "Losers"
                        ? lossPct.toFixed(1)
                        : bePct.toFixed(1)
                  }%)`,
                  name,
                ]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
              Total
            </span>
            <span className="font-mono text-lg font-semibold text-ink">
              {totalTrades}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1 text-[10px] leading-tight">
          <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-profit" />
            <span className="text-slate-500">Winners</span>
            <span className="ml-auto font-medium text-ink">
              {winners} / {winPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-loss" />
            <span className="text-slate-500">Losers</span>
            <span className="ml-auto font-medium text-ink">
              {losers} / {lossPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span className="text-slate-500">Breakeven</span>
            <span className="ml-auto font-medium text-ink">
              {breakeven} / {bePct.toFixed(1)}%
            </span>
          </div>
        </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 border-t border-line/50 pt-1.5 text-[10px]">
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Avg Win</span>
            <span className="font-mono font-medium text-profit">
              {showAmounts ? formatCurrency(avgWin) : "•••"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Avg Loss</span>
            <span className="font-mono font-medium text-loss">
              {showAmounts ? formatCurrency(avgLoss) : "•••"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Best</span>
            <span className="font-mono font-medium text-profit">
              {showAmounts ? formatCurrency(largestWin) : "•••"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Worst</span>
            <span className="font-mono font-medium text-loss">
              {showAmounts ? formatCurrency(largestLoss) : "•••"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
