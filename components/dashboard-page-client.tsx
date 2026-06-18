"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { subDays, format } from "date-fns";
import {
  Eye,
  EyeOff,
  RefreshCw,
  Settings,
  Calendar,
} from "lucide-react";
import { MetricCard } from "./metric-card";
import {
  EquityCurveChart,
  MonthlyPnlChart,
  PnlDistributionChart,
  useEquityCurveData,
  useMonthlyPnlData,
} from "./dashboard-charts";
import { PortfolioCapitalEditor } from "@/components/portfolio-capital-editor";
import { buildDashboardMetrics } from "@/lib/trade-utils";
import {
  getWeightedEntryPrice,
  getTotalEntryQty,
  getLastExitTime,
  calculateOpenPnl,
} from "@/lib/trade-utils";
import { formatCurrency, formatPercent, formatPrice } from "@/lib/format";
import type { TradeWithTxns } from "@/lib/trade-utils";

type Period = "10" | "1w" | "1m" | "3m" | "6m" | "ytd" | "all" | "custom";

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "10", label: "Last 10" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

function pnlTone(v: number) {
  if (v > 0) return "profit";
  if (v < 0) return "loss";
  return "default";
}

function computeOpenPositions(trades: TradeWithTxns[], userCapital: number) {
  return trades
    .filter((t) => t.status === "OPEN")
    .map((t) => {
      const entry = getWeightedEntryPrice(t);
      const qty = getTotalEntryQty(t);
      const cmp = t.closingPrice && t.closingPrice > 0 ? t.closingPrice : entry;
      const sl = t.stopLoss;
      const mtmPnl = calculateOpenPnl(t);
      const capital = t.capitalUsed || entry * qty;
      const allocationPct = userCapital > 0 ? (capital / userCapital) * 100 : 0;
      const riskAmount = sl ? Math.abs(entry - sl) * qty : 0;
      const riskPct = userCapital > 0 ? (riskAmount / userCapital) * 100 : 0;
      const rMultiple = riskAmount > 0 ? mtmPnl / riskAmount : 0;

      let status: "Safe" | "Watch" | "Risk High";
      if (riskPct > 4 || allocationPct > 25) status = "Risk High";
      else if (riskPct > 2.5 || allocationPct > 15)
        status = "Watch";
      else if (rMultiple < -0.5) status = "Watch";
      else status = "Safe";

      return {
        symbol: t.symbol,
        qty,
        entry,
        cmp,
        sl,
        riskPct,
        allocationPct,
        mtmPnl,
        rMultiple,
        status,
        capital,
      };
    });
}

export function DashboardPageClient({
  trades,
  userCapital,
}: {
  trades: TradeWithTxns[];
  userCapital: number;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showAmounts, setShowAmounts] = useState(true);
  const [lastUpdated] = useState(() => new Date());

  useEffect(() => {
    const saved = localStorage.getItem("dashboardPeriod") as Period | null;
    if (saved && PERIOD_TABS.some((t) => t.key === saved)) {
      setPeriod(saved);
    }
  }, []);

  const handlePeriodChange = (key: Period) => {
    setPeriod(key);
    localStorage.setItem("dashboardPeriod", key);
  };

  const filteredTrades = useMemo(() => {
    const sorted = [...trades].sort(
      (a, b) =>
        new Date(a.firstEntryAt ?? a.createdAt).getTime() -
        new Date(b.firstEntryAt ?? b.createdAt).getTime(),
    );
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    switch (period) {
      case "10":
        return sorted.slice(-10);
      case "1w": {
        const c = subDays(now, 7);
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= c,
        );
      }
      case "1m": {
        const c = subDays(now, 30);
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= c,
        );
      }
      case "3m": {
        const c = subDays(now, 90);
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= c,
        );
      }
      case "6m": {
        const c = subDays(now, 180);
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= c,
        );
      }
      case "ytd":
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= yearStart,
        );
      case "custom": {
        if (!customFrom) return sorted;
        const from = new Date(customFrom);
        const to = customTo ? new Date(customTo) : now;
        return sorted.filter((t) => {
          const d = new Date(t.firstEntryAt ?? t.createdAt);
          return d >= from && d <= to;
        });
      }
      default:
        return sorted;
    }
  }, [trades, period, customFrom, customTo]);

  const metrics = useMemo(
    () => buildDashboardMetrics(filteredTrades as any),
    [filteredTrades],
  );

  const derived = useMemo(() => {
    const closed = filteredTrades.filter((t) => t.status === "CLOSED");
    const opened = filteredTrades.filter((t) => t.status === "OPEN");

    const totalPnl = metrics.totalMtmPnl;
    const realizedPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const unrealizedPnl = opened.reduce(
      (s, t) => s + calculateOpenPnl(t),
      0,
    );

    const grossProfit = closed
      .filter((t) => (t.netPnl ?? 0) > 0)
      .reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const grossLoss = Math.abs(
      closed
        .filter((t) => (t.netPnl ?? 0) < 0)
        .reduce((s, t) => s + (t.netPnl ?? 0), 0),
    );

    const expectancy =
      closed.length > 0 ? realizedPnl / closed.length : 0;

    const closedRRs = closed.map((t) => {
      const entry = getWeightedEntryPrice(t);
      const qty = getTotalEntryQty(t);
      const sl = t.stopLoss;
      const riskAmt =
        sl ? Math.abs(entry - sl) * qty : Math.abs(entry * 0.03 * qty);
      const r = riskAmt > 0 ? (t.netPnl ?? 0) / riskAmt : 0;
      return { pnl: t.netPnl ?? 0, r, riskAmt };
    });

    const winRs = closedRRs.filter((r) => r.pnl > 0);
    const lossRs = closedRRs.filter((r) => r.pnl < 0);
    const avgWinR =
      winRs.length > 0
        ? winRs.reduce((s, r) => s + r.r, 0) / winRs.length
        : 0;
    const avgLossR =
      lossRs.length > 0
        ? Math.abs(lossRs.reduce((s, r) => s + r.r, 0)) / lossRs.length
        : 0;
    const avgRR = avgLossR > 0 ? avgWinR / avgLossR : avgWinR;

    const openPositions = computeOpenPositions(filteredTrades, userCapital).slice(0, 6);

    const capitalDeployed = openPositions.reduce(
      (s, p) => s + p.capital,
      0,
    );
    const capitalDeployedPct =
      userCapital > 0
        ? (capitalDeployed / userCapital) * 100
        : 0;

    const openRisk = openPositions.reduce((s, p) => {
      if (!p.sl) return s;
      const entry = p.entry;
      return s + Math.abs(entry - p.sl) * p.qty;
    }, 0);
    const openRiskPct =
      userCapital > 0 ? (openRisk / userCapital) * 100 : 0;

    const bestTrade = closed.length > 0
      ? closed.reduce((best, t) =>
          (t.netPnl ?? 0) > (best.netPnl ?? 0) ? t : best,
        )
      : null;
    const worstTrade = closed.length > 0
      ? closed.reduce((worst, t) =>
          (t.netPnl ?? 0) < (worst.netPnl ?? 0) ? t : worst,
        )
      : null;

    const avgHoldingDays =
      closed.length > 0
        ? closed.reduce((s, t) => {
            const start = new Date(t.firstEntryAt ?? t.createdAt);
            const exitTime = getLastExitTime(t);
            const end = exitTime ?? new Date();
            return s + Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
          }, 0) / closed.length
        : 0;

    const dayMap = new Map<string, number[]>();
    filteredTrades.forEach((t) => {
      const day = format(
        new Date(t.firstEntryAt ?? t.createdAt),
        "yyyy-MM-dd",
      );
      if (!dayMap.has(day)) dayMap.set(day, []);
      const pnl =
        t.status === "CLOSED"
          ? (t.netPnl ?? 0)
          : calculateOpenPnl(t);
      dayMap.get(day)!.push(pnl);
    });
    let bestDay = 0;
    let bestDayLabel = "";
    let worstDay = 0;
    let worstDayLabel = "";
    let winningDays = 0;
    let losingDays = 0;
    let totalDayPnl = 0;
    dayMap.forEach((pnls, day) => {
      const dayTotal = pnls.reduce((s, v) => s + v, 0);
      totalDayPnl += dayTotal;
      if (dayTotal > bestDay) {
        bestDay = dayTotal;
        bestDayLabel = day;
      }
      if (dayTotal < worstDay) {
        worstDay = dayTotal;
        worstDayLabel = day;
      }
      if (dayTotal > 0) winningDays++;
      else if (dayTotal < 0) losingDays++;
    });
    const totalDays = dayMap.size;

    const winners = closed.filter((t) => (t.netPnl ?? 0) > 0).length;
    const losers = closed.filter((t) => (t.netPnl ?? 0) < 0).length;
    const avgWin =
      winners > 0
        ? closed
            .filter((t) => (t.netPnl ?? 0) > 0)
            .reduce((s, t) => s + (t.netPnl ?? 0), 0) / winners
        : 0;
    const avgLossVal =
      losers > 0
        ? Math.abs(
            closed
              .filter((t) => (t.netPnl ?? 0) < 0)
              .reduce((s, t) => s + (t.netPnl ?? 0), 0),
          ) / losers
        : 0;
    const largestWin =
      closed.length > 0
        ? Math.max(...closed.map((t) => t.netPnl ?? 0))
        : 0;
    const largestLoss =
      closed.length > 0
        ? Math.min(...closed.map((t) => t.netPnl ?? 0))
        : 0;

    const currentStreak = (() => {
      const sorted = [...filteredTrades]
        .filter((t) => t.status === "CLOSED")
        .sort((a, b) => {
          const aExit = getLastExitTime(a);
          const bExit = getLastExitTime(b);
          return (bExit ?? new Date(b.createdAt)).getTime() - (aExit ?? new Date(a.createdAt)).getTime();
        });
      if (!sorted.length) return { type: "none" as const, count: 0 };
      const first = (sorted[0]?.netPnl ?? 0) > 0 ? "win" : "loss";
      let count = 1;
      for (let i = 1; i < sorted.length; i++) {
        const isWin = (sorted[i]?.netPnl ?? 0) > 0;
        if ((first === "win" && isWin) || (first === "loss" && !isWin))
          count++;
        else break;
      }
      return { type: first, count };
    })();

    const totalReturnPct =
      metrics.maxCapitalDeployed > 0
        ? (totalPnl / metrics.maxCapitalDeployed) * 100
        : 0;
    const realizedReturnPct =
      metrics.maxCapitalDeployed > 0
        ? (realizedPnl / metrics.maxCapitalDeployed) * 100
        : 0;
    const unrealizedReturnPct =
      metrics.maxCapitalDeployed > 0
        ? (unrealizedPnl / metrics.maxCapitalDeployed) * 100
        : 0;

    return {
      totalPnl,
      realizedPnl,
      unrealizedPnl,
      totalReturnPct,
      realizedReturnPct,
      unrealizedReturnPct,
      grossProfit,
      grossLoss,
      expectancy,
      avgRR,
      avgWinR,
      avgLossR,
      openPositions,
      capitalDeployed,
      capitalDeployedPct,
      openRisk,
      openRiskPct,
      bestTrade,
      worstTrade,
      avgHoldingDays,
      bestDay,
      bestDayLabel,
      worstDay,
      worstDayLabel,
      winningDays,
      losingDays,
      totalDays,
      winners,
      losers,
      avgWin,
      avgLoss: avgLossVal,
      largestWin,
      largestLoss,
      currentStreak,
    };
  }, [filteredTrades, userCapital, metrics]);

  const equityData = useEquityCurveData(filteredTrades, userCapital);
  const monthlyData = useMonthlyPnlData(filteredTrades);

  const monthlyDetail = useMemo(() => {
    const map = new Map<string, { pnl: number; wins: number; losses: number; trades: number }>();
    filteredTrades.forEach((t) => {
      const key = new Date(t.firstEntryAt ?? t.createdAt).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      const entry = map.get(key) ?? { pnl: 0, wins: 0, losses: 0, trades: 0 };
      const pnl = t.status === "CLOSED" ? (t.netPnl ?? 0) : calculateOpenPnl(t);
      entry.pnl += pnl;
      entry.trades += 1;
      if (pnl > 0) entry.wins += 1;
      else if (pnl < 0) entry.losses += 1;
      map.set(key, entry);
    });
    return Array.from(map.entries())
      .map(([month, d]) => ({ month, ...d }))
      .sort((a, b) => {
        const parse = (m: string) => { const [mon, yr] = m.split(" "); const months = "JanFebMarAprMayJunJulAugSepOctNovDec"; return parseInt(yr) * 12 + months.indexOf(mon) / 3; };
        return parse(a.month) - parse(b.month);
      })
      .slice(-6);
  }, [filteredTrades]);

  const availableCash = userCapital - derived.capitalDeployed;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50/50 p-2 sm:p-3">
      {/* ─── Header ─── */}
      <header className="mb-1.5 flex shrink-0 items-center justify-between rounded-xl border border-line bg-white px-3 py-2 shadow-sm sm:px-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
            Saurabh
          </h1>
          <div className="flex gap-1.5">
            <a
              href="/trades"
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200"
            >
              Journal
            </a>
            <a
              href="/trades/new"
              className="rounded-full bg-gradient-to-r from-accent to-accentDeep px-2.5 py-0.5 text-[11px] font-medium text-white transition hover:shadow-sm"
            >
              + New trade
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PortfolioCapitalEditor initialCapital={userCapital} />
          <Link
            href="/account"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Settings"
          >
            <Settings size={16} />
          </Link>
        </div>
      </header>

      {/* ─── Date Filters ─── */}
      <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-1.5">
        <div className="flex gap-0.5 overflow-x-auto rounded-lg border border-line bg-white p-0.5">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handlePeriodChange(tab.key)}
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium transition-all sm:px-2.5 sm:text-[11px] ${
                period === tab.key
                  ? "bg-accent/10 text-accent shadow-xs"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-1">
            <Calendar size={12} className="text-slate-400" />
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-28 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-600 sm:w-32"
            />
            <span className="text-[10px] text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-28 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-600 sm:w-32"
            />
          </div>
        )}

        <span className="inline-flex items-center gap-1 rounded-md bg-accent/8 px-1.5 py-0.5 text-[9px] font-medium text-accent sm:text-[10px]">
          {PERIOD_TABS.find((t) => t.key === period)?.label ?? "All"}
        </span>

        <span className="text-[9px] text-slate-400 sm:text-[10px]">
          Updated {format(lastUpdated, "dd MMM, HH:mm")}
        </span>

        <button
          onClick={() => router.refresh()}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>

        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => setShowAmounts((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-line bg-white px-2 py-0.5 text-[10px] text-slate-500 transition hover:text-slate-700"
            title={showAmounts ? "Hide amounts" : "Show amounts"}
          >
            {showAmounts ? <EyeOff size={12} /> : <Eye size={12} />}
            {showAmounts ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {/* ─── Top KPI Row (8 cards) ─── */}
      <div className="mb-1.5 grid shrink-0 grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2">
        <MetricCard
          label="Total P&L"
          value={showAmounts ? formatCurrency(derived.totalPnl) : "•••"}
          tone={pnlTone(derived.totalPnl)}
          compact
          detail={`Return: ${derived.totalReturnPct.toFixed(2)}%`}
        />
        <MetricCard
          label="Realized P&L"
          value={showAmounts ? formatCurrency(derived.realizedPnl) : "•••"}
          tone={pnlTone(derived.realizedPnl)}
          compact
          detail={`Return: ${derived.realizedReturnPct.toFixed(2)}%`}
        />
        <MetricCard
          label="Unrealized P&L"
          value={showAmounts ? formatCurrency(derived.unrealizedPnl) : "•••"}
          tone={pnlTone(derived.unrealizedPnl)}
          compact
          detail={`Return: ${derived.unrealizedReturnPct.toFixed(2)}%`}
        />
        <MetricCard
          label="Win Rate"
          value={formatPercent(metrics.winRate)}
          tone={metrics.winRate >= 50 ? "profit" : "loss"}
          compact
          detail={`${derived.winners}W / ${derived.losers}L`}
        />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor.toFixed(2)}
          tone={metrics.profitFactor >= 1 ? "profit" : "loss"}
          compact
          detail={
            <span>
              GP: {formatCurrency(derived.grossProfit)} /
              GL: {formatCurrency(derived.grossLoss)}
            </span>
          }
        />
        <MetricCard
          label="Expectancy"
          value={showAmounts ? formatCurrency(derived.expectancy) : "•••"}
          tone={pnlTone(derived.expectancy)}
          compact
          detail="Per Trade"
        />
        <MetricCard
          label="Avg R:R"
          value={`${derived.avgRR.toFixed(2)}R`}
          tone={derived.avgRR >= 1.5 ? "profit" : derived.avgRR >= 1 ? "default" : "loss"}
          compact
          detail={
            <span>
              Win: {derived.avgWinR.toFixed(2)}R / Loss: {derived.avgLossR.toFixed(2)}R
            </span>
          }
        />
        <MetricCard
          label="Open Risk"
          value={showAmounts ? formatCurrency(derived.openRisk) : "•••"}
          tone={
            derived.openRiskPct > 4
              ? "loss"
              : derived.openRiskPct > 2.5
                ? "warning"
                : "default"
          }
          compact
          detail={`${derived.openRiskPct.toFixed(2)}% of Capital`}
        />
      </div>

      {/* ─── Second KPI Strip ─── */}
      <div className="mb-1.5 flex shrink-0 items-center gap-3 overflow-x-auto rounded-lg border border-line bg-white px-3 py-1.5 text-[10px] shadow-sm sm:text-[11px]">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Open Trades:</span>
          <span className="font-semibold text-ink">{metrics.openTrades}</span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Capital Deployed:</span>
          <span className="font-semibold text-ink">
            {showAmounts ? formatCurrency(derived.capitalDeployed) : "•••"} /{" "}
            {derived.capitalDeployedPct.toFixed(1)}%
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Risk Used:</span>
          <span
            className={`font-semibold ${
              derived.openRiskPct > 4
                ? "text-loss"
                : derived.openRiskPct > 2.5
                  ? "text-amber-600"
                  : "text-profit"
            }`}
          >
            {derived.openRiskPct.toFixed(2)}%
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Max DD:</span>
          <span className="font-semibold text-loss">
            {equityData.maxDrawdownPct.toFixed(2)}%{" / "}
            {showAmounts ? formatCurrency(equityData.maxDrawdownAmt) : "•••"}
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Recovery:</span>
          <span
            className={`font-semibold ${
              equityData.recovery >= 90
                ? "text-profit"
                : equityData.recovery >= 50
                  ? "text-amber-600"
                  : "text-loss"
            }`}
          >
            {equityData.recovery.toFixed(1)}%
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Avg Hold:</span>
          <span className="font-semibold text-ink">
            {derived.avgHoldingDays.toFixed(1)}d
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Best:</span>
          <span className="font-semibold text-profit">
            {showAmounts && derived.bestTrade
              ? `${formatCurrency(derived.bestTrade.netPnl ?? 0)} / ${derived.bestTrade.symbol}`
              : "•••"}
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Worst:</span>
          <span className="font-semibold text-loss">
            {showAmounts && derived.worstTrade
              ? `${formatCurrency(derived.worstTrade.netPnl ?? 0)} / ${derived.worstTrade.symbol}`
              : "•••"}
          </span>
        </div>
      </div>

      {/* ─── Main Content: Equity Curve (70%) + Risk Summary (30%) ─── */}
      <div className="mb-1.5 grid min-h-0 flex-[2] grid-cols-[7fr_3fr] gap-2 sm:gap-3">
        {/* Equity Curve */}
        <div className="flex flex-col rounded-xl border border-line bg-white p-2.5 shadow-sm sm:p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Equity Curve
            </p>
            <span className="text-[9px] text-slate-400">Daily</span>
          </div>
          <EquityCurveChart equityData={equityData} showAmounts={showAmounts} />
        </div>

        {/* Monthly Performance */}
        <div className="flex flex-col rounded-xl border border-line bg-white p-2.5 shadow-sm sm:p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
            Monthly Performance
          </p>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="pb-1 font-medium">Month</th>
                  <th className="pb-1 text-right font-medium">P&L</th>
                  <th className="pb-1 text-right font-medium">Trades</th>
                  <th className="pb-1 text-right font-medium">W/L</th>
                </tr>
              </thead>
              <tbody>
                {monthlyDetail.length > 0 ? (
                  monthlyDetail.map((m) => (
                    <tr key={m.month} className="border-t border-line/30">
                      <td className="py-1 font-medium text-ink">{m.month}</td>
                      <td className={`py-1 text-right font-mono font-medium ${m.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {showAmounts ? formatCurrency(m.pnl) : "•••"}
                      </td>
                      <td className="py-1 text-right text-slate-600">{m.trades}</td>
                      <td className="py-1 text-right">
                        <span className="font-medium text-profit">{m.wins}</span>
                        <span className="text-slate-300">/</span>
                        <span className="font-medium text-loss">{m.losses}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">No data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {monthlyDetail.length > 0 && (
            <div className="mt-auto border-t border-line/30 pt-1.5 text-[9px] text-slate-400">
              Total: {showAmounts ? formatCurrency(monthlyDetail.reduce((s, m) => s + m.pnl, 0)) : "•••"} &middot;{" "}
              {monthlyDetail.reduce((s, m) => s + m.trades, 0)} trades &middot;{" "}
              {monthlyDetail.reduce((s, m) => s + m.wins, 0)}W / {monthlyDetail.reduce((s, m) => s + m.losses, 0)}L
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Section: Open Positions (50%) + Monthly P&L (25%) + Distribution (25%) ─── */}
      <div className="mb-1.5 grid min-h-0 flex-[1.3] grid-cols-[2.5fr_1fr_1fr] gap-2 sm:gap-3">
        {/* Open Positions */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Open Positions
            </p>
            <span className="text-[9px] text-slate-400">
              {derived.openPositions.length} positions
            </span>
          </div>

          {derived.openPositions.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-x-auto">
              <table className="w-full text-[10px] sm:text-[11px]">
                <thead>
                  <tr className="border-b border-line text-left text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium">
                      Stock
                    </th>
                    <th className={`sticky top-0 bg-white px-2 py-1 font-medium text-right ${showAmounts ? "" : "text-slate-300"}`}>
                      {showAmounts ? "Qty" : "••"}
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      Entry
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      CMP
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      SL
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      Risk %
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      Alloc %
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      MTM P&L
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      R
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-center">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {derived.openPositions.map((pos) => (
                    <tr
                      key={pos.symbol}
                      className="border-b border-line/50 transition hover:bg-slate-50/50"
                    >
                      <td className="px-2 py-1 font-medium text-ink">
                        {pos.symbol}
                      </td>
                      <td className="px-2 py-1 text-right text-slate-600">
                        {showAmounts ? pos.qty : "••"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-slate-600">
                        {formatPrice(pos.entry)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-slate-600">
                        {formatPrice(pos.cmp)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-slate-500">
                        {pos.sl ? formatPrice(pos.sl) : "--"}
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono font-medium ${
                          pos.riskPct <= 2.5
                            ? "text-profit"
                            : pos.riskPct <= 4
                              ? "text-amber-600"
                              : "text-loss"
                        }`}
                      >
                        {pos.riskPct.toFixed(2)}%
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono font-medium ${
                          pos.allocationPct <= 15
                            ? "text-profit"
                            : pos.allocationPct <= 25
                              ? "text-amber-600"
                              : "text-loss"
                        }`}
                      >
                        {pos.allocationPct.toFixed(1)}%
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono font-medium ${
                          pos.mtmPnl >= 0 ? "text-profit" : "text-loss"
                        }`}
                      >
                        {showAmounts
                          ? pos.mtmPnl >= 0
                            ? formatCurrency(pos.mtmPnl)
                            : `-${formatCurrency(Math.abs(pos.mtmPnl))}`
                          : "•••"}
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono font-medium ${
                          pos.rMultiple > 0 ? "text-profit" : "text-loss"
                        }`}
                      >
                        {pos.rMultiple.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <span
                          className={`inline-block rounded-full px-1.5 py-[1px] text-[9px] font-medium ${
                            pos.status === "Safe"
                              ? "bg-profit/10 text-profit"
                              : pos.status === "Watch"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-loss/10 text-loss"
                          }`}
                        >
                          {pos.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex gap-4 border-t border-line/50 px-3 py-1 text-[9px] text-slate-400">
                <span>
                  Risk:{" "}
                  <span className="text-profit">&le;2.5%</span>{" "}
                  <span className="text-amber-600">2.5-4%</span>{" "}
                  <span className="text-loss">&gt;4%</span>
                </span>
                <span>
                  Alloc:{" "}
                  <span className="text-profit">&le;15%</span>{" "}
                  <span className="text-amber-600">15-25%</span>{" "}
                  <span className="text-loss">&gt;25%</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
              No open positions
            </div>
          )}
        </div>

        {/* Monthly P&L */}
        <div className="rounded-xl border border-line bg-white p-2.5 shadow-sm sm:p-3">
          <MonthlyPnlChart
            data={monthlyData.data}
            totalPnl={monthlyData.totalPnl}
            showAmounts={showAmounts}
          />
        </div>

        {/* P&L Distribution */}
        <div className="rounded-xl border border-line bg-white p-2.5 shadow-sm sm:p-3">
          <PnlDistributionChart
            winners={derived.winners}
            losers={derived.losers}
            totalTrades={metrics.totalTrades}
            avgWin={derived.avgWin}
            avgLoss={derived.avgLoss}
            largestWin={derived.largestWin}
            largestLoss={derived.largestLoss}
          />
        </div>
      </div>

      {/* ─── Bottom Insight Strip ─── */}
      <div className="flex shrink-0 items-center gap-4 overflow-x-auto rounded-lg border border-line bg-white px-3 py-1.5 text-[10px] shadow-sm sm:text-[11px]">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Best Day:</span>
          <span className="font-semibold text-profit">
            {showAmounts
              ? `${formatCurrency(derived.bestDay)} / ${derived.bestDayLabel ? format(new Date(derived.bestDayLabel), "dd MMM") : "--"}`
              : "•••"}
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Worst Day:</span>
          <span className="font-semibold text-loss">
            {showAmounts
              ? `${formatCurrency(derived.worstDay)} / ${derived.worstDayLabel ? format(new Date(derived.worstDayLabel), "dd MMM") : "--"}`
              : "•••"}
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Avg P&L/Day:</span>
          <span
            className={`font-semibold ${
              derived.totalDays > 0 && derived.totalPnl / derived.totalDays >= 0
                ? "text-profit"
                : "text-loss"
            }`}
          >
            {showAmounts
              ? formatCurrency(
                  derived.totalDays > 0
                    ? derived.totalPnl / derived.totalDays
                    : 0,
                )
              : "•••"}
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Avg P&L/Trade:</span>
          <span
            className={`font-semibold ${
              metrics.totalTrades + metrics.openTrades > 0 && derived.totalPnl >= 0
                ? "text-profit"
                : "text-loss"
            }`}
          >
            {showAmounts
              ? formatCurrency(
                  metrics.totalTrades + metrics.openTrades > 0
                    ? derived.totalPnl / (metrics.totalTrades + metrics.openTrades)
                    : 0,
                )
              : "•••"}
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Total Trades:</span>
          <span className="font-semibold text-ink">
            {metrics.totalTrades}
          </span>
        </div>
      </div>
    </div>
  );
}


