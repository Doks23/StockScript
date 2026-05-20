"use client";

import { useState, useMemo } from "react";
import { subDays } from "date-fns";
import { Eye, EyeOff } from "lucide-react";
import { MetricCard } from "./metric-card";
import { DashboardCharts } from "./dashboard-charts";
import { buildDashboardMetrics } from "@/lib/trade-utils";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";

type Period = "10" | "1w" | "1m" | "3m" | "all" | "custom";

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: "10", label: "Last 10" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

function pnlTone(value: number) {
  if (value > 0) return "profit";
  if (value < 0) return "loss";
  return "default";
}

export function DashboardPageClient({
  trades,
  userCapital,
  groupedTrades,
}: {
  trades: any[];
  userCapital: number;
  groupedTrades: any[];
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showAmounts, setShowAmounts] = useState(true);

  const filteredTrades = useMemo(() => {
    const sorted = [...trades].sort(
      (a, b) =>
        new Date(a.firstEntryAt ?? a.createdAt).getTime() -
        new Date(b.firstEntryAt ?? b.createdAt).getTime(),
    );

    const now = new Date();

    switch (period) {
      case "10":
        return sorted.slice(-10);
      case "1w": {
        const cutoff = subDays(now, 7);
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= cutoff,
        );
      }
      case "1m": {
        const cutoff = subDays(now, 30);
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= cutoff,
        );
      }
      case "3m": {
        const cutoff = subDays(now, 90);
        return sorted.filter(
          (t) => new Date(t.firstEntryAt ?? t.createdAt) >= cutoff,
        );
      }
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

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex w-full gap-1 overflow-x-auto rounded-full border border-line bg-canvas p-1 scrollbar-hide sm:mx-0 sm:w-auto">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                period === tab.key
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-slate-600 sm:flex-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-slate-600 sm:flex-none"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowAmounts((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-slate-500 transition hover:text-slate-700"
          title={showAmounts ? "Hide amounts" : "Show amounts"}
        >
          {showAmounts ? <EyeOff size={14} /> : <Eye size={14} />}
          {showAmounts ? "Hide $" : "Show $"}
        </button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 md:grid-cols-3">
        <MetricCard
          label="Closed Trades"
          value={String(metrics.totalTrades)}
        />
        <MetricCard label="Open Trades" value={String(metrics.openTrades)} />
        <MetricCard
          label="Win Rate"
          value={formatPercent(metrics.winRate)}
          tone="profit"
        />
        <MetricCard
          label="Net Realized P&L"
          value={showAmounts ? formatCurrency(metrics.totalRealizedPnl) : "•••"}
          tone={pnlTone(metrics.totalRealizedPnl)}
        />
        <MetricCard
          label="Total P&L (MTM)"
          value={showAmounts ? formatCurrency(metrics.totalMtmPnl) : "•••"}
          tone={pnlTone(metrics.totalMtmPnl)}
        />
        <MetricCard
          label="Profit Factor"
          value={formatRatio(metrics.profitFactor)}
          tone={metrics.profitFactor >= 1 ? "profit" : "loss"}
        />
      </div>

      <DashboardCharts
        trades={filteredTrades}
        metrics={metrics}
        userCapital={userCapital}
        groupedTrades={groupedTrades}
        showAmounts={showAmounts}
      />
    </div>
  );
}
