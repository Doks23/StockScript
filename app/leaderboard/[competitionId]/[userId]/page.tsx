import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveUser } from "@/lib/auth";
import { format } from "date-fns";
import { formatPercent } from "@/lib/format";
import { getTraderCompetitionTrades } from "@/lib/queries";
import {
  getWeightedEntryPrice,
  getWeightedExitPrice,
  getTotalEntryQty,
  getFirstEntryTime,
  getLastExitTime,
  buildDashboardMetrics,
} from "@/lib/trade-utils";

const fmtDate = (d: Date | null | undefined) =>
  d ? format(new Date(d), "dd MMM yy") : "—";

type Props = { params: { competitionId: string; userId: string } };

export default async function TraderDrillDownPage({ params }: Props) {
  await requireActiveUser();
  const data = await getTraderCompetitionTrades(params.competitionId, params.userId);
  if (!data) notFound();

  const { competition, user: trader, trades } = data;
  const portfolioCapital = trader.portfolioCapital ?? 100000;
  const metrics = buildDashboardMetrics(trades);

  // Portfolio-level totals
  const totalPnlPct = metrics.returnOnCapital; // totalNetPnl / maxCapitalDeployed * 100

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[36px] border border-white/70 bg-[linear-gradient(135deg,rgba(15,23,32,0.96),rgba(49,91,74,0.88))] p-7 text-white shadow-soft">
        <Link href={`/leaderboard?competitionId=${competition.id}`}
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition">
          <ArrowLeft className="h-4 w-4" />
          Back to leaderboard
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold">{trader.name}</h1>
        <p className="mt-2 text-base text-white/65">
          Competition: <span className="font-medium text-white/90">{competition.name}</span>
        </p>
      </section>

      {/* Portfolio summary — % only, no ₹ */}
      <section className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Closed Trades", value: String(metrics.totalTrades) },
          { label: "Win Rate", value: formatPercent(metrics.winRate), positive: metrics.winRate > 50 },
          { label: "Portfolio Return %", value: formatPercent(totalPnlPct), positive: totalPnlPct >= 0 },
          { label: "Profit Factor", value: metrics.profitFactor.toFixed(2), positive: metrics.profitFactor >= 1 },
        ].map((card) => (
          <div key={card.label} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-slate-500">{card.label}</p>
            <p className={`mt-2 text-2xl font-bold ${
              card.positive === undefined ? "text-slate-800"
              : card.positive ? "text-emerald-600" : "text-red-500"
            }`}>
              {card.value}
            </p>
          </div>
        ))}
      </section>

      {/* Trade table — no ₹ amounts */}
      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-[12px]">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Symbol</th>
                <th className="px-4 py-3 text-center">L/S</th>
                <th className="px-4 py-3 text-center">Segment</th>
                <th className="px-4 py-3 text-right">Entry Date</th>
                <th className="px-4 py-3 text-right">Exit Date</th>
                <th className="px-4 py-3 text-right border-l border-slate-700">Trade P&amp;L %</th>
                <th className="px-4 py-3 text-right">Portfolio Impact %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trades.map((trade) => {
                const entryP = getWeightedEntryPrice(trade);
                const exitP = getWeightedExitPrice(trade);
                const qty = getTotalEntryQty(trade);
                const capital = trade.capitalUsed || entryP * qty;
                const tradePnlPct = capital > 0 ? (trade.netPnl / capital) * 100 : 0;
                const portfolioImpactPct = portfolioCapital > 0
                  ? (trade.netPnl / portfolioCapital) * 100 : 0;
                const pnlColor = trade.netPnl > 0 ? "text-emerald-600" : trade.netPnl < 0 ? "text-red-500" : "text-slate-400";

                return (
                  <tr key={trade.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800 uppercase text-[13px]">
                      {trade.symbol}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        trade.tradeType === "LONG"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-600"
                      }`}>
                        {trade.tradeType === "LONG" ? "L" : "S"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 uppercase text-[10px] tracking-wider">
                      {trade.segment}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {fmtDate(getFirstEntryTime(trade))}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {fmtDate(getLastExitTime(trade))}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold border-l border-slate-100 ${pnlColor}`}>
                      {tradePnlPct !== 0
                        ? `${tradePnlPct > 0 ? "+" : ""}${tradePnlPct.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${pnlColor}`}>
                      {portfolioImpactPct !== 0
                        ? `${portfolioImpactPct > 0 ? "+" : ""}${portfolioImpactPct.toFixed(2)}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No qualifying trades in this competition window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
