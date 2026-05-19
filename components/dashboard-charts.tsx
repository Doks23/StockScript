"use client";

import { useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/format";
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

// Use these to compute the gradient stop offset where the area crosses zero.
function computeZeroOffset(data: { equity: number }[]) {
  if (!data.length) return 1;
  const values = data.map((d) => d.equity);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max <= 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}
import { ArrowUp, ArrowDown } from "lucide-react";
import { calculateOpenPnl } from "@/lib/trade-utils";

const ACCENT = "#0c8f6a";
const PROFIT = "#157f5b";
const LOSS = "#b33f40";

export function DashboardCharts({
  trades,
  metrics,
  userCapital,
  groupedTrades,
  showAmounts = true,
}: {
  trades: any[];
  metrics: any;
  userCapital: number;
  groupedTrades: any[];
  showAmounts?: boolean;
}) {
  const { equityCurve, recentStats, monthlyTotals } = useMemo(() => {
    const sorted = [...trades].sort(
      (a, b) =>
        new Date(a.firstEntryAt ?? a.createdAt).getTime() -
        new Date(b.firstEntryAt ?? b.createdAt).getTime(),
    );

    let cumulative = 0;
    const equityCurve = sorted.map((t: any) => {
      const pnl =
        t.status === "CLOSED"
          ? t.netPnl
          : t.closingPrice
            ? calculateOpenPnl(t)
            : 0;
      cumulative += pnl;
      return {
        date: new Date(t.firstEntryAt ?? t.createdAt).toLocaleDateString(
          undefined,
          { month: "short", day: "numeric" },
        ),
        equity: cumulative,
      };
    });

    const recent = sorted.slice(-10);
    const last10 = {
      winners: recent.filter((t: any) => {
        const pnl =
          t.status === "CLOSED"
            ? t.netPnl
            : t.closingPrice
              ? calculateOpenPnl(t)
              : 0;
        return pnl > 0;
      }).length,
      losers: recent.filter((t: any) => {
        const pnl =
          t.status === "CLOSED"
            ? t.netPnl
            : t.closingPrice
              ? calculateOpenPnl(t)
              : 0;
        return pnl < 0;
      }).length,
      total: recent.length,
    };

    const monthlyMap = new Map();
    sorted.forEach((t: any) => {
      const month = new Date(t.firstEntryAt ?? t.createdAt).toLocaleDateString(
        undefined,
        { month: "short", year: "2-digit" },
      );
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, {
          month,
          winners: 0,
          losers: 0,
          pnl: 0,
          capital: 0,
        });
      }
      const data = monthlyMap.get(month);

      const pnl =
        t.status === "CLOSED"
          ? t.netPnl
          : t.closingPrice
            ? calculateOpenPnl(t)
            : 0;
      if (pnl > 0) data.winners += 1;
      if (pnl < 0) data.losers += 1;

      data.pnl += pnl;
      data.capital += t.capitalUsed || t.weightedEntryPrice * t.totalEntryQty;
    });

    const monthlyTotals = Array.from(monthlyMap.values()).map((m: any) => ({
      ...m,
      pnlPct: m.capital > 0 ? (m.pnl / m.capital) * 100 : 0,
    }));

    return { equityCurve, recentStats: last10, monthlyTotals };
  }, [trades]);

  const PIE_COLORS = [PROFIT, LOSS];
  const pieData = [
    { name: "Wins", value: metrics.winRate },
    { name: "Losses", value: 100 - metrics.winRate },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top row */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 md:grid-cols-3">
        {/* Recent Performance */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-3 sm:text-sm sm:mb-4">
            Recent Performance
          </p>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <ArrowUp className="w-6 h-6 text-profit sm:w-8 sm:h-8" />
              <span className="text-2xl font-display font-semibold text-profit sm:text-3xl">
                {recentStats.winners}
              </span>
            </div>
            <span className="text-xl text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <ArrowDown className="w-6 h-6 text-loss sm:w-8 sm:h-8" />
              <span className="text-2xl font-display font-semibold text-loss sm:text-3xl">
                {recentStats.losers}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-line flex justify-between text-xs text-slate-500 sm:mt-4 sm:pt-4 sm:text-sm">
            <span className="text-slate-400">Sample Size</span>
            <span className="font-medium text-ink">
              {recentStats.total} trades
            </span>
          </div>
        </div>

        {/* Batting Average */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm flex flex-col items-center sm:rounded-3xl sm:p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 self-start sm:text-sm">
            Batting Average
          </p>
          <div className="h-28 w-full mt-2 sm:h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={50}
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `${Number(value).toFixed(1)}%`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2 text-sm font-medium">
            <span style={{ color: PROFIT }}>
              Win {metrics.winRate.toFixed(1)}%
            </span>
            <span style={{ color: LOSS }}>
              Loss {(100 - metrics.winRate).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Trade Stats Block */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm space-y-2.5 text-sm sm:col-span-2 md:col-span-1 sm:rounded-3xl sm:p-5 sm:space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-500">Trade</span>
            <span className="font-medium text-ink">{metrics.totalTrades}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Win</span>
            <span className="font-medium" style={{ color: PROFIT }}>
              {Math.round(metrics.totalTrades * (metrics.winRate / 100))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Loss</span>
            <span className="font-medium" style={{ color: LOSS }}>
              {metrics.totalTrades -
                Math.round(metrics.totalTrades * (metrics.winRate / 100))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Pnl</span>
            <span
              className={`font-medium ${metrics.totalMtmPnl >= 0 ? "text-profit" : "text-loss"}`}
            >
              {showAmounts ? formatCurrency(metrics.totalMtmPnl) : "•••"}
            </span>
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <p className="text-sm font-medium text-slate-700 mb-3 sm:text-md sm:mb-4">Equity Curve</p>
        <div className="h-[220px] w-full sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={equityCurve}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PROFIT} stopOpacity={0.25} />
                  <stop
                    offset={`${computeZeroOffset(equityCurve) * 100}%`}
                    stopColor={PROFIT}
                    stopOpacity={0.02}
                  />
                  <stop
                    offset={`${computeZeroOffset(equityCurve) * 100}%`}
                    stopColor={LOSS}
                    stopOpacity={0.02}
                  />
                  <stop offset="100%" stopColor={LOSS} stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id="colorEquityStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PROFIT} />
                  <stop
                    offset={`${computeZeroOffset(equityCurve) * 100}%`}
                    stopColor={PROFIT}
                  />
                  <stop
                    offset={`${computeZeroOffset(equityCurve) * 100}%`}
                    stopColor={LOSS}
                  />
                  <stop offset="100%" stopColor={LOSS} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                tickMargin={10}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val) => showAmounts ? `₹${val}` : ""}
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
              <Tooltip
                formatter={(value: any) => formatCurrency(Number(value))}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="url(#colorEquityStroke)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorEquityFill)"
                baseValue={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row Charts */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Portfolio Allocation % */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-slate-700 mb-3 sm:mb-4">
            Portfolio Allocation % (Open)
          </p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trades
                  .filter((t: any) => t.status === "OPEN")
                  .slice(0, 6)
                  .map((t: any) => ({
                    symbol: t.symbol,
                    allocationPct:
                      userCapital > 0
                        ? ((t.capitalUsed ||
                            t.weightedEntryPrice * t.totalEntryQty ||
                            0) /
                            userCapital) *
                          100
                        : 0,
                  }))}
                margin={{ top: 0, right: 0, left: -25, bottom: 0 }}
              >
                <XAxis
                  dataKey="symbol"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickMargin={5}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => `${val.toFixed(1)}%`}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                />
                <Bar
                  dataKey="allocationPct"
                  fill={ACCENT}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PnL */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-slate-700 mb-3 sm:mb-4">PnL</p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyTotals}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickMargin={5}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: any) => [
                    `${Number(value).toFixed(1)}%`,
                    "PnL",
                  ]}
                />
                <ReferenceLine y={0} stroke="#e2e5ea" />
                <Bar
                  dataKey="pnlPct"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                >
                  {monthlyTotals.map((m: any, idx: number) => (
                    <Cell
                      key={`pnl-cell-${idx}`}
                      fill={m.pnlPct >= 0 ? PROFIT : LOSS}
                      fillOpacity={0.55}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Winners per Month */}
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
          <p className="text-sm font-medium text-slate-700 mb-3 sm:mb-4">
            # Winners per Month
          </p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyTotals}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickMargin={5}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                <Bar
                  dataKey="winners"
                  fill={ACCENT}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
