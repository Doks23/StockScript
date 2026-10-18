import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";
import { ArrowLeft } from "lucide-react";
import { requireActiveUser } from "@/lib/auth";
import { format } from "date-fns";
import { formatPercent } from "@/lib/format";
import { getTraderCompetitionTrades } from "@/lib/queries";
import {
  buildGroupedJournalMetrics,
  buildGroupedJournalRows,
} from "@/lib/trade-utils";

const fmtPriceIntl = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrice = (n: number) => fmtPriceIntl.format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtPctNoSign = (n: number) => `${n.toFixed(1)}%`;
const fmtDate = (d: Date | null | undefined) =>
  d ? format(new Date(d), "dd MMM yy") : "—";
const hasPnlData = (row: ReturnType<typeof buildGroupedJournalRows>[number]) =>
  row.derivedStatus === "CLOSED" ||
  row.exitQty > 0 ||
  !!(row.closingPrice && row.closingPrice > 0);
const isPartiallyClosed = (row: ReturnType<typeof buildGroupedJournalRows>[number]) =>
  row.derivedStatus === "OPEN" && row.exitQty > 0;
const getTradeStatusUi = (row: ReturnType<typeof buildGroupedJournalRows>[number]) => {
  if (isPartiallyClosed(row)) {
    return {
      label: "PARTIAL",
      chipClass: "border-amber-200 bg-amber-50 text-amber-700",
      borderClass: "border-l-amber-400",
      rowClass: "bg-amber-50/40",
      title: "Partially closed with remaining open quantity",
    };
  }
  if (row.derivedStatus === "OPEN") {
    return {
      label: "OPEN",
      chipClass: "border-blue-200 bg-blue-50 text-blue-700",
      borderClass: "border-l-blue-400",
      rowClass: "bg-blue-50/20",
      title: "Open position",
    };
  }

  return {
    label: "",
    chipClass: "",
    borderClass: "border-l-slate-200",
    rowClass: "hover:bg-slate-50",
    title: "Closed trade",
  };
};

type Props = { params: { competitionId: string; userId: string } };

export default async function TraderDrillDownPage({ params }: Props) {
  await requireActiveUser();
  const data = await getTraderCompetitionTrades(params.competitionId, params.userId);
  if (!data) notFound();

  const { competition, user: trader, trades } = data;
  const portfolioCapital = trader.portfolioCapital ?? 100000;
  const rows = buildGroupedJournalRows(trades, portfolioCapital);
  const metrics = buildGroupedJournalMetrics(rows, portfolioCapital);

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
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Closed Trades", value: String(metrics.closedTrades) },
          { label: "Win Rate", value: formatPercent(metrics.winRate), positive: metrics.winRate > 50 },
          { label: "Return on Capital", value: formatPercent(metrics.returnOnCapital), positive: metrics.returnOnCapital >= 0 },
          { label: "Portfolio Impact", value: formatPercent(metrics.portfolioReturn), positive: metrics.portfolioReturn >= 0 },
          { label: "Total Allocation", value: formatPercent(metrics.totalAllocationPct), positive: metrics.totalAllocationPct <= 100 },
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
        <div className="sticky-head w-full overflow-x-auto scrollbar-hide">
          <table className="w-full whitespace-nowrap text-right text-[12px] text-slate-700">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider border-b border-line">
                <th className="px-3 py-3 text-left min-w-[130px]">Symbol</th>
                <th className="px-3 py-3 text-center" colSpan={2}>Entry</th>
                <th className="px-3 py-3 text-center border-l border-slate-300" colSpan={2}>Exit</th>
                <th className="px-3 py-3 text-center border-l border-slate-300">SL %</th>
                <th className="px-3 py-3 text-center">Alloc %</th>
                <th className="px-3 py-3 text-center">Age</th>
                <th className="px-3 py-3 text-center border-l border-slate-300">Avg Entry ₹</th>
                <th className="px-3 py-3 text-center border-l border-slate-300">P&amp;L %</th>
                <th className="px-3 py-3 text-center">Impact %</th>
              </tr>
              <tr className="bg-white text-slate-400 text-[10px] border-b border-line">
                <th className="px-3 py-1.5 text-left">L / S</th>
                <th className="px-3 py-1.5">Price</th>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5 border-l border-slate-300">Price</th>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5 border-l border-slate-300" />
                <th className="px-3 py-1.5" />
                <th className="px-3 py-1.5" />
                <th className="px-3 py-1.5 border-l border-slate-300" />
                <th className="px-3 py-1.5 border-l border-slate-300" />
                <th className="px-3 py-1.5" />
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {rows.map((trade) => {
                const maxLegs = Math.max(trade.entryLegs.length, trade.exitLegs.length, 1);
                const showPnl = hasPnlData(trade);
                const pnlColor = (n: number) => n > 0 ? "text-emerald-600" : n < 0 ? "text-red-500" : "text-slate-400";
                const statusUi = getTradeStatusUi(trade);
                const borderStyle = `border-l-4 ${statusUi.borderClass}`;

                return (
                  <React.Fragment key={trade.id}>
                    {Array.from({ length: maxLegs }).map((_, idx) => {
                      const eLeg = trade.entryLegs[idx];
                      const xLeg = trade.exitLegs[idx];
                      const isFirst = idx === 0;

                      return (
                        <tr key={`${trade.id}-${idx}`}
                          className={`transition-colors ${statusUi.rowClass} ${isFirst ? borderStyle : "border-l-4 border-l-transparent"}`}>

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
                                {statusUi.label && (
                                  <span
                                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${statusUi.chipClass}`}
                                    title={statusUi.title}
                                  >
                                    {statusUi.label}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium">
                            {eLeg?.price ? fmtPrice(eLeg.price) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-500 text-[11px]">
                            {eLeg?.dateTime ? fmtDate(eLeg.dateTime) : <span className="text-slate-300">—</span>}
                          </td>

                          <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium border-l border-line">
                            {xLeg?.price > 0 ? fmtPrice(xLeg.price) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-500 text-[11px]">
                            {xLeg?.dateTime ? fmtDate(xLeg.dateTime) : <span className="text-slate-300">—</span>}
                          </td>

                          {isFirst && (
                            <>
                              <td className="px-3 py-3 text-right tabular-nums font-medium border-l border-line" rowSpan={maxLegs}>
                                {trade.stopLossPct !== null
                                  ? <span className="text-red-500">{fmtPctNoSign(Math.abs(trade.stopLossPct))}</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-600" rowSpan={maxLegs}>
                                {fmtPctNoSign(trade.allocationPct)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums" rowSpan={maxLegs}>
                                <span className={trade.ageDays > 30 ? "text-amber-600 font-medium" : "text-slate-500"}>
                                  {trade.ageDays}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium border-l border-line" rowSpan={maxLegs}>
                                {trade.weightedEntryPrice > 0 ? fmtPrice(trade.weightedEntryPrice) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className={`px-3 py-3 text-right align-middle border-l border-line ${pnlColor(trade.displayPnlAmount)}`} rowSpan={maxLegs}>
                                {!showPnl ? (
                                  <span className="text-slate-300">—</span>
                                ) : trade.derivedStatus === "CLOSED" ? (
                                  <span className="font-semibold tabular-nums">{`${trade.pnlPct >= 0 ? "+" : ""}${fmtPct(trade.pnlPct)}`}</span>
                                ) : trade.realizedPnl === 0 ? (
                                  <span className="font-semibold tabular-nums">
                                    {`${trade.unrealizedPnl >= 0 ? "+" : ""}${fmtPct(trade.unrealizedPnlPct)}`}
                                    <span className="text-[9px] text-slate-400 ml-0.5">MTM</span>
                                  </span>
                                ) : (
                                  <span className="tabular-nums leading-tight">
                                    <span className={`block font-semibold text-[11px] ${pnlColor(trade.realizedPnl)}`}>
                                      {`${trade.realizedPnl >= 0 ? "+" : ""}${fmtPct(trade.realizedPnlPct)}`}
                                    </span>
                                    {trade.unrealizedPnl !== 0 && (
                                      <span className={`block text-[10px] ${pnlColor(trade.unrealizedPnl)} opacity-60`}>
                                        {`U:${trade.unrealizedPnl >= 0 ? "+" : ""}${fmtPct(trade.unrealizedPnlPct)}`}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className={`px-3 py-3 text-right font-semibold ${pnlColor(trade.impactPct)}`} rowSpan={maxLegs}>
                                {showPnl
                                  ? `${trade.impactPct > 0 ? "+" : ""}${fmtPct(trade.impactPct)}`
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 text-sm">
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
