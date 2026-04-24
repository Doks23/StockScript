"use client";

import { useState, useMemo } from "react";
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
import { ArrowUp, ArrowDown } from "lucide-react";
import { calculateOpenPnl } from "@/lib/trade-utils";

export function DashboardCharts({
  trades,
  metrics,
  userCapital,
  groupedTrades,
}: {
  trades: any[];
  metrics: any;
  userCapital: number;
  groupedTrades: any[];
}) {
  const [timeRange, setTimeRange] = useState<"10" | "1w" | "1m" | "3m" | "all">(
    "10",
  );

  const { equityCurve, recentStats, monthlyTotals } = useMemo(() => {
    // Sort trades asc by firstEntryAt
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
  }, [trades, userCapital]);

  const PIE_COLORS = ["#10b981", "#ef4444"]; // Green, Red
  const pieData = [
    { name: "Wins", value: metrics.winRate },
    { name: "Losses", value: 100 - metrics.winRate },
  ];

  return (
    <div className="space-y-6">
      {/* Top row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Past Trades Analysis */}
        <div className="rounded-3xl border border-[#f0e7cf] bg-white p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm uppercase tracking-wider text-slate-500">
              Recent Performance
            </p>
            <div className="flex bg-slate-100 p-1 rounded-full gap-1">
              {(["10", "1w", "1m", "3m", "all"] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-[10px] font-medium rounded-full transition-all duration-200 ${
                    timeRange === range
                      ? "bg-white text-ink shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {range === "10"
                    ? "Last 10"
                    : range === "1w"
                      ? "1w"
                      : range === "1m"
                        ? "1m"
                        : range === "3m"
                          ? "3m"
                          : "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2 text-profit">
              <ArrowUp className="w-8 h-8" />
              <span className="text-3xl font-display font-semibold">
                {recentStats.winners}
              </span>
            </div>
            <span className="text-xl text-slate-400">vs</span>
            <div className="flex items-center gap-2 text-loss">
              <ArrowDown className="w-8 h-8 relative top-1" />
              <span className="text-3xl font-display font-semibold relative top-1">
                {recentStats.losers}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-sm text-slate-500">
            <span className="text-slate-400">Sample Size</span>
            <span className="font-medium text-ink">
              {recentStats.total} trades
            </span>
          </div>
        </div>

        {/* Batting Average */}
        <div className="rounded-3xl border border-[#f0e7cf] bg-white p-5 shadow-sm flex flex-col items-center">
          <p className="text-sm uppercase tracking-wider text-slate-500 mb-2 self-start">
            Batting Average
          </p>
          <div className="h-32 w-full mt-2">
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
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2 text-sm font-medium">
            <span className="text-profit">
              Win {metrics.winRate.toFixed(1)}%
            </span>
            <span className="text-loss">
              Loss {(100 - metrics.winRate).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Trade Stats Block */}
        <div className="rounded-3xl border border-[#f0e7cf] bg-white p-5 shadow-sm space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Trade</span>
            <span className="font-medium">{metrics.totalTrades}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Win</span>
            <span className="font-medium text-profit">
              {Math.round(metrics.totalTrades * (metrics.winRate / 100))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Loss</span>
            <span className="font-medium text-loss">
              {metrics.totalTrades -
                Math.round(metrics.totalTrades * (metrics.winRate / 100))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Pnl</span>
            <span
              className={`font-medium ${metrics.totalNetPnl >= 0 ? "text-profit" : "text-loss"}`}
            >
              {formatCurrency(metrics.totalNetPnl)}
            </span>
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="rounded-3xl border border-[#f0e7cf] bg-white p-6 shadow-sm">
        <p className="text-md font-medium text-slate-700 mb-4">Equity Curve</p>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={equityCurve}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--accent)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--accent)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickMargin={10}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val) => `₹${val}`}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: any) => formatCurrency(Number(value))}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#a7770e"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorEquity)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Portfolio Allocation % */}
        <div className="rounded-3xl border border-[#f0e7cf] bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 mb-4">
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
                  tick={{ fontSize: 10 }}
                  tickMargin={5}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => `${val.toFixed(0)}%`}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                />
                <Bar
                  dataKey="allocationPct"
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PnL */}
        <div className="rounded-3xl border border-[#f0e7cf] bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 mb-4">PnL</p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyTotals}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10 }}
                  tickMargin={5}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: any) => [
                    `${Number(value).toFixed(1)}%`,
                    "PnL",
                  ]}
                />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                <Bar
                  dataKey="pnlPct"
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Winners per Month */}
        <div className="rounded-3xl border border-[#f0e7cf] bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 mb-4">
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
                  tick={{ fontSize: 10 }}
                  tickMargin={5}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="winners" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
