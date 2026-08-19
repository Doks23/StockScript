"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { subDays, format, differenceInCalendarDays } from "date-fns";
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

import {
  buildDashboardMetrics,
  buildGroupedJournalRows,
  getEntryTransactions,
  getWeightedEntryPrice,
  getTotalEntryQty,
  getTotalExitQty,
  getLastExitTime,
  calculateOpenPnl,
} from "@/lib/trade-utils";
import {
  buildClosedSummaryTrades,
  buildMonthlySummary,
  buildSetupSummary,
  formatReturnPercent,
  formatSummaryNumber,
  formatSummaryPercent,
} from "@/lib/journal-summary";
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

type DashboardThresholdSettings = {
  breakEvenR: number;
  profitableR: number;
  riskWarnPct: number;
  riskHighPct: number;
  allocationWarnPct: number;
  allocationHighPct: number;
};

const DEFAULT_DASHBOARD_THRESHOLDS: DashboardThresholdSettings = {
  breakEvenR: 1,
  profitableR: 2,
  riskWarnPct: 2.5,
  riskHighPct: 4,
  allocationWarnPct: 15,
  allocationHighPct: 25,
};

function readDashboardThresholds() {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_THRESHOLDS;
  try {
    const saved = localStorage.getItem("dashboardThresholdSettings");
    if (!saved) return DEFAULT_DASHBOARD_THRESHOLDS;
    return {
      ...DEFAULT_DASHBOARD_THRESHOLDS,
      ...JSON.parse(saved),
    } as DashboardThresholdSettings;
  } catch {
    return DEFAULT_DASHBOARD_THRESHOLDS;
  }
}

function pnlTone(v: number) {
  if (v > 0) return "profit";
  if (v < 0) return "loss";
  return "default";
}

function computeOpenPositions(
  trades: TradeWithTxns[],
  userCapital: number,
  settings: DashboardThresholdSettings,
) {
  return trades
    .filter((t) => t.status === "OPEN")
    .map((t) => {
      const entry = getWeightedEntryPrice(t);
      const firstEntry = getEntryTransactions(t)[0]?.price ?? entry;
      const entryQty = getTotalEntryQty(t);
      const exitQty = getTotalExitQty(t);
      const qty = Math.max(0, entryQty - exitQty);
      const cmp = t.closingPrice && t.closingPrice > 0 ? t.closingPrice : entry;
      const sl = t.stopLoss;
      const mtmPnl = calculateOpenPnl(t);
      const capital = entry * qty;
      const allocationPct = userCapital > 0 ? (capital / userCapital) * 100 : 0;
      const riskAmount = sl ? Math.abs(entry - sl) * qty : 0;
      const riskPct = userCapital > 0 ? (riskAmount / userCapital) * 100 : 0;
      const slPct = sl && firstEntry > 0 ? Math.abs(((sl - firstEntry) / firstEntry) * 100) : null;
      const rMultiple = riskAmount > 0 ? mtmPnl / riskAmount : 0;
      const ageDays = differenceInCalendarDays(new Date(), t.firstEntryAt ?? t.createdAt);

      let status: "OpenRisk" | "BreakEven" | "Profitable";
      if (rMultiple > settings.profitableR) status = "Profitable";
      else if (rMultiple >= settings.breakEvenR) status = "BreakEven";
      else status = "OpenRisk";

      return {
        symbol: t.symbol,
        qty,
        entry,
        cmp,
        sl,
        slPct,
        riskPct,
        allocationPct,
        mtmPnl,
        rMultiple,
        status,
        capital,
        ageDays,
      };
    })
    .filter((position) => position.qty > 0);
}

function metricToneClass(value: number | null) {
  if (value === null || value === 0) return "text-slate-500";
  return value > 0 ? "text-profit" : "text-loss";
}

function thresholdToneClass(value: number, warn: number, high: number) {
  if (value > high) return "text-loss";
  if (value > warn) return "text-amber-600";
  return "text-profit";
}

function displaySymbol(symbol: string, max = 12) {
  return symbol.length > max ? `${symbol.slice(0, max - 1)}…` : symbol;
}

export function DashboardPageClient({
  trades,
  userName,
  userCapital,
}: {
  trades: TradeWithTxns[];
  userName: string;
  userCapital: number;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showAmounts, setShowAmounts] = useState(true);
  const [lastUpdated] = useState(() => new Date());
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [thresholdSettings, setThresholdSettings] = useState(
    DEFAULT_DASHBOARD_THRESHOLDS,
  );

  useEffect(() => {
    const saved = localStorage.getItem("dashboardPeriod") as Period | null;
    if (saved && PERIOD_TABS.some((t) => t.key === saved)) {
      setPeriod(saved);
    }
    setThresholdSettings(readDashboardThresholds());
  }, []);

  useEffect(() => {
    const refreshThresholds = () => setThresholdSettings(readDashboardThresholds());
    window.addEventListener("storage", refreshThresholds);
    window.addEventListener("dashboard-threshold-settings-updated", refreshThresholds);
    return () => {
      window.removeEventListener("storage", refreshThresholds);
      window.removeEventListener("dashboard-threshold-settings-updated", refreshThresholds);
    };
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

    const openPositions = computeOpenPositions(
      filteredTrades,
      userCapital,
      thresholdSettings,
    );

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
    opened.forEach((t) => {
      const day = format(
        new Date(t.firstEntryAt ?? t.createdAt),
        "yyyy-MM-dd",
      );
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(calculateOpenPnl(t));
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
  }, [filteredTrades, userCapital, metrics, thresholdSettings]);

  const equityData = useEquityCurveData(filteredTrades, userCapital);
  const monthlyData = useMonthlyPnlData(filteredTrades);

  const monthOptions = useMemo(() => {
    const groupedRows = buildGroupedJournalRows(filteredTrades, userCapital);
    const options = new Map<string, string>();

    groupedRows.forEach((row) => {
      const entryDate = row.entryLegs[0]?.dateTime;
      if (row.derivedStatus !== "CLOSED" || !entryDate) return;
      const key = format(entryDate, "yyyy-MM");
      options.set(key, format(entryDate, "MMMM yyyy"));
    });

    return Array.from(options.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredTrades, userCapital]);

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonthKey("");
      return;
    }

    const currentMonthKey = format(new Date(), "yyyy-MM");
    const nextKey = monthOptions.some((option) => option.key === currentMonthKey)
      ? currentMonthKey
      : monthOptions[0].key;

    setSelectedMonthKey((current) =>
      monthOptions.some((option) => option.key === current) ? current : nextKey,
    );
  }, [monthOptions]);

  const selectedMonthlySummary = useMemo(() => {
    if (!selectedMonthKey) return null;
    const [yearValue, monthValue] = selectedMonthKey.split("-").map(Number);
    const monthIndex = monthValue - 1;
    const yearTrades = filteredTrades.filter((trade) => {
      const entryDate = new Date(trade.firstEntryAt ?? trade.createdAt);
      return entryDate.getFullYear() === yearValue;
    });
    const groupedRows = buildGroupedJournalRows(yearTrades, userCapital);
    const summaryTrades = buildClosedSummaryTrades(groupedRows, yearTrades);
    const monthlySummary = buildMonthlySummary(summaryTrades);
    const setupSummary = buildSetupSummary(
      summaryTrades.filter((trade) => {
        const entryDate = trade.row.entryLegs[0]?.dateTime;
        return entryDate?.getMonth() === monthIndex;
      }),
    );
    const monthLabel = format(new Date(yearValue, monthIndex, 1), "MMMM");
    const month = monthlySummary.rows.find((row) => row.label === monthLabel) ?? null;

    return {
      month,
      setups: setupSummary.rows
        .sort((a, b) => Math.abs(b.netR) - Math.abs(a.netR))
        .slice(0, 6),
    };
  }, [filteredTrades, selectedMonthKey, userCapital]);

  return (
    <div className="flex min-h-dvh flex-col overflow-y-auto bg-slate-50/50 p-2 sm:p-3 xl:h-dvh xl:overflow-hidden">
      {/* ─── Header ─── */}
      <header className="mb-1.5 flex shrink-0 flex-col gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-sm sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
            {userName}
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
        <div className="flex items-center justify-between gap-3 lg:justify-end lg:gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Capital</p>
                <p className="font-display text-sm font-semibold text-ink">
                  {showAmounts ? formatCurrency(userCapital) : "•••"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Available</p>
                <p className="font-display text-sm font-semibold text-profit">
                  {showAmounts ? formatCurrency(userCapital - derived.capitalDeployed) : "•••"}
                </p>
              </div>
            </div>
            <Link
              href="/account"
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title="Account settings"
            >
              <Settings size={16} />
            </Link>
          </div>
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
      <div className="mb-1.5 grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8 xl:gap-2">
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
          className="hidden sm:block"
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
          className="hidden sm:block"
          detail="Per Trade"
        />
        <MetricCard
          label="Avg R:R"
          value={`${derived.avgRR.toFixed(2)}R`}
          tone={derived.avgRR >= 1.5 ? "profit" : derived.avgRR >= 1 ? "default" : "loss"}
          compact
          className="hidden sm:block"
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
          className="hidden sm:block"
          detail={`${derived.openRiskPct.toFixed(2)}% of Capital`}
        />
      </div>

      <div className="mb-1.5 grid shrink-0 grid-cols-2 gap-1.5 text-[10px] md:hidden">
        <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 shadow-sm">
          <p className="uppercase tracking-[0.12em] text-slate-400">Open Trades</p>
          <p className="font-semibold text-ink">{metrics.openTrades}</p>
        </div>
        <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 shadow-sm">
          <p className="uppercase tracking-[0.12em] text-slate-400">Capital Used</p>
          <p className="font-semibold text-ink">
            {derived.capitalDeployedPct.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 shadow-sm">
          <p className="uppercase tracking-[0.12em] text-slate-400">Max DD</p>
          <p className="font-semibold text-loss">
            {equityData.maxDrawdownPct.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 shadow-sm">
          <p className="uppercase tracking-[0.12em] text-slate-400">Recovery</p>
          <p
            className={`font-semibold ${
              equityData.recovery >= 90
                ? "text-profit"
                : equityData.recovery >= 50
                  ? "text-amber-600"
                  : "text-loss"
            }`}
          >
            {equityData.recovery.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* ─── Second KPI Strip ─── */}
      <div className="mb-1.5 hidden shrink-0 items-center gap-3 overflow-x-auto rounded-lg border border-line bg-white px-3 py-1.5 text-[10px] shadow-sm md:flex sm:text-[11px]">
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
      <div className="mb-1.5 grid min-h-0 gap-2 sm:gap-3 xl:flex-[2] xl:grid-cols-[7fr_3fr]">
        {/* Equity Curve */}
        <div className="flex min-h-[320px] flex-col rounded-xl border border-line bg-white p-2.5 shadow-sm sm:p-3 xl:min-h-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Equity Curve
            </p>
            <span className="text-[9px] text-slate-400">Daily</span>
          </div>
          <EquityCurveChart equityData={equityData} showAmounts={showAmounts} />
        </div>

        {/* Monthly Performance */}
        <div className="hidden min-h-[220px] flex-col rounded-xl border border-line bg-white p-2.5 shadow-sm md:flex sm:p-3 xl:min-h-0">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Monthly Summary
              </p>
              <p className="mt-0.5 text-[9px] text-slate-400">
                One active month at a time
              </p>
            </div>
            <select
              value={selectedMonthKey}
              onChange={(event) => setSelectedMonthKey(event.target.value)}
              className="max-w-[130px] rounded-md border border-line bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-xs outline-none transition focus:border-accent"
            >
              {monthOptions.length > 0 ? (
                monthOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))
              ) : (
                <option value="">No months</option>
              )}
            </select>
          </div>

          {selectedMonthlySummary?.month ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <div className="grid grid-cols-3 gap-1">
                <div className="rounded-lg bg-slate-50 px-2 py-1">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    Net R
                  </p>
                  <p className={`font-mono text-base font-semibold ${metricToneClass(selectedMonthlySummary.month.netR)}`}>
                    {formatSummaryNumber(selectedMonthlySummary.month.netR)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    Win %
                  </p>
                  <p className="font-mono text-base font-semibold text-ink">
                    {formatSummaryPercent(selectedMonthlySummary.month.winPct)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    RR
                  </p>
                  <p className={`font-mono text-base font-semibold ${metricToneClass(selectedMonthlySummary.month.simpleRR)}`}>
                    {formatSummaryNumber(selectedMonthlySummary.month.simpleRR)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="rounded-lg border border-line/70 px-2 py-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-slate-400">Trades</span>
                    <span className="font-semibold text-ink">
                      {selectedMonthlySummary.month.totalTrades}
                    </span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="bg-profit"
                      style={{
                        width: `${selectedMonthlySummary.month.totalTrades > 0
                          ? (selectedMonthlySummary.month.wins / selectedMonthlySummary.month.totalTrades) * 100
                          : 0}%`,
                      }}
                    />
                    <div
                      className="bg-loss"
                      style={{
                        width: `${selectedMonthlySummary.month.totalTrades > 0
                          ? (selectedMonthlySummary.month.losses / selectedMonthlySummary.month.totalTrades) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[9px]">
                    <span className="text-profit">{selectedMonthlySummary.month.wins}W</span>
                    <span className="px-1 text-slate-300">/</span>
                    <span className="text-loss">{selectedMonthlySummary.month.losses}L</span>
                    {selectedMonthlySummary.month.breakeven > 0 && (
                      <>
                        <span className="px-1 text-slate-300">/</span>
                        <span className="text-slate-500">{selectedMonthlySummary.month.breakeven}BE</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded-lg border border-line/70 px-2 py-1">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <p className="text-slate-400">Avg Win</p>
                    <p className="text-right font-mono font-medium text-profit">
                      {formatReturnPercent(selectedMonthlySummary.month.winAverage)}
                    </p>
                    <p className="text-slate-400">Avg Loss</p>
                    <p className="text-right font-mono font-medium text-loss">
                      {formatReturnPercent(selectedMonthlySummary.month.lossAverage)}
                    </p>
                    <p className="text-slate-400">Best</p>
                    <p className="text-right font-mono font-medium text-profit">
                      {formatReturnPercent(selectedMonthlySummary.month.maxWin)}
                    </p>
                    <p className="text-slate-400">Worst</p>
                    <p className="text-right font-mono font-medium text-loss">
                      {formatReturnPercent(selectedMonthlySummary.month.maxLoss)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line/70 px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.12em] text-slate-400">
                  <span>Setup Summary</span>
                  <span>Net R</span>
                </div>
                <div className="space-y-1">
                  {selectedMonthlySummary.setups.length > 0 ? (
                    selectedMonthlySummary.setups.map((setup) => (
                      <div
                        key={setup.label}
                        className="grid grid-cols-[1fr_2.3rem_2.8rem_2.8rem] items-center gap-1 text-[10px]"
                      >
                        <p className="truncate font-medium text-ink">
                          {setup.label}
                        </p>
                        <p className="text-right text-slate-500">
                          {setup.totalTrades}T
                        </p>
                        <p className="text-right font-mono text-slate-600">
                          {formatSummaryPercent(setup.winPct, 0)}
                        </p>
                        <p className={`text-right font-mono font-semibold ${metricToneClass(setup.netR)}`}>
                          {formatSummaryNumber(setup.netR)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      No setup data
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 border-t border-line/40 pt-1 text-[9px]">
                <div>
                  <p className="text-slate-400">Gross R</p>
                  <p className={`font-mono font-semibold ${metricToneClass(selectedMonthlySummary.month.grossR)}`}>
                    {formatSummaryNumber(selectedMonthlySummary.month.grossR)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Max R</p>
                  <p className={`font-mono font-semibold ${metricToneClass(selectedMonthlySummary.month.maxR)}`}>
                    {formatSummaryNumber(selectedMonthlySummary.month.maxR)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Avg Win Days</p>
                  <p className="font-mono font-semibold text-ink">
                    {formatSummaryNumber(selectedMonthlySummary.month.avgWinDays)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Avg Loss Days</p>
                  <p className="font-mono font-semibold text-ink">
                    {formatSummaryNumber(selectedMonthlySummary.month.avgLossDays)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
              No data
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Section: Open Positions (50%) + Monthly P&L (25%) + Distribution (25%) ─── */}
      <div className="mb-1.5 grid min-h-0 gap-2 sm:gap-3 lg:grid-cols-2 xl:flex-[1.3] xl:grid-cols-[2.5fr_1fr_1fr]">
        {/* Open Positions */}
        <div className="rounded-xl border border-line bg-white shadow-sm md:hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Open Positions
            </p>
            <span className="text-[9px] text-slate-400">
              {derived.openPositions.length}
            </span>
          </div>
          {derived.openPositions.length > 0 ? (
            <div className="max-h-[360px] divide-y divide-line/50 overflow-y-auto">
              {derived.openPositions.map((pos) => (
                <div key={pos.symbol} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">
                        <span title={pos.symbol}>{displaySymbol(pos.symbol)}</span>
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Open Qty {showAmounts ? pos.qty : "••"} · Avg Entry {showAmounts ? formatPrice(pos.entry) : "•••"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-medium ${
                        pos.status === "Profitable"
                          ? "bg-profit/10 text-profit"
                          : pos.status === "BreakEven"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-loss/10 text-loss"
                      }`}
                    >
                      {pos.status}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-5 gap-1 text-[9px]">
                    <div>
                      <p className="text-slate-400">Age</p>
                      <p className={`font-mono font-semibold ${pos.ageDays > 30 ? "text-amber-600" : "text-slate-700"}`}>
                        {pos.ageDays}d
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">MTM</p>
                      <p className={`font-mono font-semibold ${pos.mtmPnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {showAmounts ? formatCurrency(pos.mtmPnl) : "•••"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Risk</p>
                      <p className={`font-mono font-semibold ${thresholdToneClass(pos.riskPct, thresholdSettings.riskWarnPct, thresholdSettings.riskHighPct)}`}>
                        {pos.riskPct.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Alloc</p>
                      <p className={`font-mono font-semibold ${thresholdToneClass(pos.allocationPct, thresholdSettings.allocationWarnPct, thresholdSettings.allocationHighPct)}`}>
                        {pos.allocationPct.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">R</p>
                      <p className={`font-mono font-semibold ${pos.rMultiple >= 0 ? "text-profit" : "text-loss"}`}>
                        {pos.rMultiple.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No open positions
            </div>
          )}
        </div>

        <div className="hidden min-h-[230px] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm md:flex lg:col-span-2 xl:col-span-1 xl:min-h-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Open Positions
            </p>
            <span className="text-[9px] text-slate-400">
              {derived.openPositions.length} positions
            </span>
          </div>

          {derived.openPositions.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-[10px] sm:text-[11px]">
                <thead>
                  <tr className="border-b border-line text-left text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium">
                      Stock
                    </th>
                    <th className={`sticky top-0 bg-white px-2 py-1 font-medium text-right ${showAmounts ? "" : "text-slate-300"}`}>
                      {showAmounts ? "Open Qty" : "••"}
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      Avg Entry
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      Age
                    </th>
                    <th className="sticky top-0 bg-white px-2 py-1 font-medium text-right">
                      SL %
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
                      <td className="max-w-[92px] truncate px-2 py-1 font-medium text-ink" title={pos.symbol}>
                        {displaySymbol(pos.symbol)}
                      </td>
                      <td className="px-2 py-1 text-right text-slate-600">
                        {showAmounts ? pos.qty : "••"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-slate-600">
                        {showAmounts ? formatPrice(pos.entry) : "•••"}
                      </td>
                      <td className={`px-2 py-1 text-right font-mono ${pos.ageDays > 30 ? "text-amber-600 font-medium" : "text-slate-500"}`}>
                        {pos.ageDays}d
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-slate-500">
                        {pos.slPct !== null ? `${pos.slPct.toFixed(1)}%` : "--"}
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono font-medium ${
                          thresholdToneClass(
                            pos.riskPct,
                            thresholdSettings.riskWarnPct,
                            thresholdSettings.riskHighPct,
                          )
                        }`}
                      >
                        {pos.riskPct.toFixed(2)}%
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono font-medium ${
                          thresholdToneClass(
                            pos.allocationPct,
                            thresholdSettings.allocationWarnPct,
                            thresholdSettings.allocationHighPct,
                          )
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
                            pos.status === "Profitable"
                              ? "bg-profit/10 text-profit"
                              : pos.status === "BreakEven"
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
                  <span className="text-profit">&le;{thresholdSettings.riskWarnPct}%</span>{" "}
                  <span className="text-amber-600">
                    {thresholdSettings.riskWarnPct}-{thresholdSettings.riskHighPct}%
                  </span>{" "}
                  <span className="text-loss">&gt;{thresholdSettings.riskHighPct}%</span>
                </span>
                <span>
                  Alloc:{" "}
                  <span className="text-profit">&le;{thresholdSettings.allocationWarnPct}%</span>{" "}
                  <span className="text-amber-600">
                    {thresholdSettings.allocationWarnPct}-{thresholdSettings.allocationHighPct}%
                  </span>{" "}
                  <span className="text-loss">&gt;{thresholdSettings.allocationHighPct}%</span>
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
        <div className="min-h-[220px] rounded-xl border border-line bg-white p-2.5 shadow-sm sm:p-3 xl:min-h-0">
          <MonthlyPnlChart
            data={monthlyData.data}
            totalPnl={monthlyData.totalPnl}
            showAmounts={showAmounts}
          />
        </div>

        {/* P&L Distribution */}
        <div className="min-h-[220px] rounded-xl border border-line bg-white p-2.5 shadow-sm sm:p-3 xl:min-h-0">
          <PnlDistributionChart
            winners={derived.winners}
            losers={derived.losers}
            totalTrades={metrics.totalTrades}
            avgWin={derived.avgWin}
            avgLoss={derived.avgLoss}
            largestWin={derived.largestWin}
            largestLoss={derived.largestLoss}
            showAmounts={showAmounts}
          />
        </div>
      </div>

      {/* ─── Bottom Insight Strip ─── */}
      <div className="hidden shrink-0 items-center gap-4 overflow-x-auto rounded-lg border border-line bg-white px-3 py-1.5 text-[10px] shadow-sm md:flex sm:text-[11px]">
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
              derived.totalDays > 0 && derived.unrealizedPnl / derived.totalDays >= 0
                ? "text-profit"
                : "text-loss"
            }`}
          >
            {showAmounts
              ? formatCurrency(
                  derived.totalDays > 0
                    ? derived.unrealizedPnl / derived.totalDays
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
              metrics.openTrades > 0 && derived.unrealizedPnl >= 0
                ? "text-profit"
                : "text-loss"
            }`}
          >
            {showAmounts
              ? formatCurrency(
                  metrics.openTrades > 0
                    ? derived.unrealizedPnl / metrics.openTrades
                    : 0,
                )
              : "•••"}
          </span>
        </div>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Total Trades:</span>
          <span className="font-semibold text-ink">
            {metrics.openTrades}
          </span>
        </div>
      </div>
    </div>
  );
}
