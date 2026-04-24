import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { requireActiveUser } from "@/lib/auth";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { getDashboardData } from "@/lib/queries";
import { PortfolioCapitalEditor } from "@/components/portfolio-capital-editor";
import { DashboardCharts } from "@/components/dashboard-charts";

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const dashboard = await getDashboardData(user.id);

  return (
    <div className="space-y-8">
      <section className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-5">
            <h1 className="font-display text-2xl font-semibold text-slate-800 tracking-tight">
              {user.name}
            </h1>
            <div className="flex gap-2">
              <Link
                href="/trades"
                className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Journal
              </Link>
              <Link
                href="/trades/new"
                className="rounded-full bg-gradient-to-r from-accent to-accentDeep px-4 py-1.5 text-sm font-medium text-white transition hover:shadow-md"
              >
                New trade
              </Link>
            </div>
          </div>
        </div>

        <div className="w-full md:w-auto rounded-2xl bg-canvas border border-slate-100 p-4 shadow-inner">
          <PortfolioCapitalEditor initialCapital={user.portfolioCapital} />
        </div>
      </section>

      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-1">

          {/* General Stats */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">General</p>
            <section className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <MetricCard label="Closed Trades" value={String(dashboard.metrics.totalTrades)} />
              <MetricCard label="Open Trades" value={String(dashboard.metrics.openTrades)} />
            </section>
          </div>

          {/* Performance Stats */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">Performance</p>
            <section className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <MetricCard label="Win Rate" value={formatPercent(dashboard.metrics.winRate)} tone="profit" />
              <MetricCard
                label="Net Realized P&L"
                value={formatCurrency(dashboard.metrics.totalRealizedPnl)}
                tone={dashboard.metrics.totalRealizedPnl >= 0 ? "profit" : "loss"}
              />
              <MetricCard
                label="Total P&L (MTM)"
                value={formatCurrency(dashboard.metrics.totalMtmPnl)}
                tone={dashboard.metrics.totalMtmPnl >= 0 ? "profit" : "loss"}
              />
              <MetricCard
                label="ROI %"
                value={formatPercent(dashboard.metrics.returnOnCapital)}
                tone={dashboard.metrics.returnOnCapital >= 0 ? "profit" : "loss"}
              />
            </section>
          </div>

          {/* Risk & Efficiency */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">Risk & Efficiency</p>
            <section className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <MetricCard
                label="Profit Factor"
                value={formatNumber(dashboard.metrics.profitFactor)}
                tone={dashboard.metrics.profitFactor >= 1 ? "profit" : "loss"}
              />
              <MetricCard
                label="Risk:Reward"
                value={formatNumber(dashboard.metrics.riskRewardRatio)}
              />
              <MetricCard
                label="Max Drawdown"
                value={formatPercent(dashboard.metrics.maxDrawdown)}
                tone="loss"
              />
            </section>
          </div>
        </div>

        <section>
          <DashboardCharts
            trades={dashboard.trades}
            metrics={dashboard.metrics}
            userCapital={user.portfolioCapital}
            groupedTrades={dashboard.groupedTrades}
          />
        </section>
      </div>
    </div>
  );
}
