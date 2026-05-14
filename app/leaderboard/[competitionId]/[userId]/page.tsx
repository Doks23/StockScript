import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";
import { ArrowLeft } from "lucide-react";
import { requireActiveUser } from "@/lib/auth";
import { format } from "date-fns";
import { formatPercent } from "@/lib/format";
import { getTraderCompetitionTrades } from "@/lib/queries";
import {
  getEntryTransactions,
  getExitTransactions,
  getWeightedEntryPrice,
  getWeightedExitPrice,
  getTotalEntryQty,
  getFirstEntryTime,
  getLastExitTime,
  buildDashboardMetrics,
} from "@/lib/trade-utils";
import type { EntryLeg } from "@/lib/trade-utils";

const fmtNum = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtQty = (n: number) => Number.isInteger(n) ? n.toLocaleString("en-IN") : fmtNum.format(n);
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

  const totalPnlPct = metrics.returnOnCapital;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-line bg-white p-7 shadow-sm">
        <Link href={`/leaderboard?competitionId=${competition.id}`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-accent transition">
          <ArrowLeft className="h-4 w-4" />
          Back to leaderboard
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">{trader.name}</h1>
        <p className="mt-2 text-base text-slate-500">
          Competition: <span className="font-medium text-slate-700">{competition.name}</span>
        </p>
      </section>

      {/* Portfolio summary */}
      <section className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Closed Trades", value: String(metrics.totalTrades) },
          { label: "Win Rate", value: formatPercent(metrics.winRate), positive: metrics.winRate > 50 },
          { label: "Portfolio Return %", value: formatPercent(totalPnlPct), positive: totalPnlPct >= 0 },
          { label: "Profit Factor", value: metrics.profitFactor.toFixed(2), positive: metrics.profitFactor >= 1 },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
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

      {/* Trade table — same format as Journal */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm p-3">
        <div className="w-full overflow-x-auto scrollbar-hide">
          <table className="w-full whitespace-nowrap text-right text-[12px] text-slate-700">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider border-b border-line">
                <th className="px-3 py-3 text-left min-w-[130px]">Symbol</th>
                <th className="px-3 py-3 text-center" colSpan={3}>Entry</th>
                <th className="px-3 py-3 text-center border-l border-slate-300" colSpan={3}>Exit</th>
                <th className="px-3 py-3 text-center border-l border-slate-300">P&amp;L %</th>
                <th className="px-3 py-3 text-center">Impact %</th>
              </tr>
              <tr className="bg-white text-slate-400 text-[10px] border-b border-line">
                <th className="px-3 py-1.5 text-left">L / S</th>
                <th className="px-3 py-1.5">Qty</th>
                <th className="px-3 py-1.5">Price</th>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5 border-l border-slate-300">Qty</th>
                <th className="px-3 py-1.5">Price</th>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5 border-l border-slate-300" />
                <th className="px-3 py-1.5" />
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {trades.map((trade) => {
                const entries = getEntryTransactions(trade);
                const exits = getExitTransactions(trade);
                const entryLegs: EntryLeg[] = entries.map((t) => ({
                  qty: t.quantity,
                  price: t.price,
                  dateTime: new Date(t.dateTime),
                }));
                const exitLegs: EntryLeg[] = exits.map((t) => ({
                  qty: t.quantity,
                  price: t.price,
                  dateTime: new Date(t.dateTime),
                }));
                const maxLegs = Math.max(entryLegs.length, exitLegs.length, 1);

                const capital = trade.capitalUsed || getWeightedEntryPrice(trade) * getTotalEntryQty(trade);
                const tradePnlPct = capital > 0 ? (trade.netPnl / capital) * 100 : 0;
                const portfolioImpactPct = portfolioCapital > 0
                  ? (trade.netPnl / portfolioCapital) * 100 : 0;
                const pnlColor = trade.netPnl > 0 ? "text-emerald-600" : trade.netPnl < 0 ? "text-red-500" : "text-slate-400";

                return (
                  <React.Fragment key={trade.id}>
                    {Array.from({ length: maxLegs }).map((_, idx) => {
                      const eLeg = entryLegs[idx];
                      const xLeg = exitLegs[idx];
                      const isFirst = idx === 0;

                      return (
                        <tr key={`${trade.id}-${idx}`}
                          className={`hover:bg-slate-50 transition-colors ${isFirst ? "" : "border-l-4 border-l-transparent"}`}>

                          {isFirst && (
                            <td className="px-3 py-3 text-left align-middle" rowSpan={maxLegs}>
                              <div className="flex items-center gap-1.5">
                                <span className={`shrink-0 w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold ${
                                  trade.tradeType === "LONG" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                                }`}>
                                  {trade.tradeType === "LONG" ? "L" : "S"}
                                </span>
                                <span className="font-semibold text-slate-800 text-[12px] uppercase tracking-wide">
                                  {trade.symbol}
                                </span>
                              </div>
                            </td>
                          )}

                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                            {eLeg?.qty ? fmtQty(eLeg.qty) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium">
                            {eLeg?.price ? fmtNum.format(eLeg.price) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-500 text-[11px]">
                            {eLeg?.dateTime ? fmtDate(eLeg.dateTime) : <span className="text-slate-300">—</span>}
                          </td>

                          <td className="px-3 py-3 text-right tabular-nums text-slate-600 border-l border-line">
                            {xLeg?.qty > 0 ? fmtQty(xLeg.qty) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium">
                            {xLeg?.price > 0 ? fmtNum.format(xLeg.price) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-500 text-[11px]">
                            {xLeg?.dateTime ? fmtDate(xLeg.dateTime) : <span className="text-slate-300">—</span>}
                          </td>

                          {isFirst && (
                            <>
                              <td className={`px-3 py-3 text-right font-semibold border-l border-line ${pnlColor}`} rowSpan={maxLegs}>
                                {tradePnlPct !== 0
                                  ? `${tradePnlPct > 0 ? "+" : ""}${fmtNum.format(tradePnlPct)}%`
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className={`px-3 py-3 text-right font-semibold ${pnlColor}`} rowSpan={maxLegs}>
                                {portfolioImpactPct !== 0
                                  ? `${portfolioImpactPct > 0 ? "+" : ""}${fmtNum.format(portfolioImpactPct)}%`
                                  : <span className="text-slate-300">—</span>}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-sm">
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
