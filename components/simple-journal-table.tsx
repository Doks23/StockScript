"use client";

import React, { useState, useMemo } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import type { GroupedTradeRow } from "@/lib/trade-utils";
import { SymbolChartLink } from "@/components/symbol-chart-link";
import { getTradeStatusUi } from "@/lib/trade-status";

const fmtPrice = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const pnlColor = (n: number) => n > 0 ? "text-emerald-600" : n < 0 ? "text-red-500" : "text-slate-400";
// Same as the detailed journal - the two views are read side by side.
const fmtDate = (d: Date | string | null | undefined) =>
  d ? format(new Date(d), "dd MMM yy") : "—";
const hiddenAmt = <span className="text-slate-300">•••</span>;

export const SIMPLE_JOURNAL_FONT_DEFAULT = 13;

type SortKey =
  | "symbol"
  | "entryDate"
  | "avgEntryPrice"
  | "avgExitPrice"
  | "stopLossPct"
  | "ageDays"
  | "allocationPct"
  | "openQty"
  | "pnlPct"
  | "impactPct"
  | "reviewed";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="inline ml-0.5 h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ArrowUp className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />
    : <ArrowDown className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />;
}

export function SimpleJournalTable({
  rows,
  showAmounts = true,
  fontPx = SIMPLE_JOURNAL_FONT_DEFAULT,
}: {
  rows: GroupedTradeRow[];
  showAmounts?: boolean;
  fontPx?: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let av = 0;
      let bv = 0;
      switch (sortKey) {
        case "symbol":
          const cmp = a.symbol.localeCompare(b.symbol);
          return sortDir === "asc" ? cmp : -cmp;
        case "entryDate":
          av = new Date(a.entryDate).getTime();
          bv = new Date(b.entryDate).getTime();
          break;
        case "avgEntryPrice": av = a.weightedEntryPrice; bv = b.weightedEntryPrice; break;
        case "avgExitPrice": av = a.exitPrice; bv = b.exitPrice; break;
        case "stopLossPct": av = a.stopLossPct ?? 0; bv = b.stopLossPct ?? 0; break;
        case "ageDays": av = a.ageDays; bv = b.ageDays; break;
        case "allocationPct": av = a.allocationPct; bv = b.allocationPct; break;
        case "openQty": av = a.openQty; bv = b.openQty; break;
        case "pnlPct": av = a.pnlPct; bv = b.pnlPct; break;
        case "impactPct": av = a.impactPct; bv = b.impactPct; break;
        case "reviewed": av = a.reviewed ? 1 : 0; bv = b.reviewed ? 1 : 0; break;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir]);

  function th(key: SortKey, label: string, className = "") {
    return (
      <th
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-[0.82em] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-100 ${className}`}
        onClick={() => handleSort(key)}
      >
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </th>
    );
  }

  return (
    // Sizing the wrapper rather than each cell: the rows carry no font size of
    // their own, so one number here scales the whole table.
    <div className="overflow-x-auto" style={{ fontSize: `${fontPx}px` }}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line bg-slate-50">
            {th("symbol", "Symbol")}
            {th("entryDate", "Entry Date")}
            {th("avgEntryPrice", "Avg Entry")}
            {th("avgExitPrice", "Avg Exit")}
            {th("stopLossPct", "SL %")}
            {th("ageDays", "Age (d)")}
            {th("allocationPct", "Alloc %")}
            {th("openQty", "Open Qty")}
            {th("pnlPct", "PNL %")}
            {th("impactPct", "Impact %")}
            {th("reviewed", "Reviewed")}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sortedRows.map((row) => {
            const statusUi = getTradeStatusUi(row);
            return (
            <tr
              key={row.id}
              className={`border-l-4 ${statusUi.borderClass} ${statusUi.rowClass} transition-colors hover:bg-slate-50/60`}
            >
              <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">
                <span className="flex min-w-0 items-center gap-1.5">
                  <SymbolChartLink
                    symbol={row.symbol}
                    className="transition hover:text-blue-600"
                  >
                    {row.symbol}
                  </SymbolChartLink>
                  {statusUi.label && (
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[0.68em] font-semibold tracking-wide ${statusUi.chipClass}`}
                      title={statusUi.title}
                    >
                      {statusUi.label}
                    </span>
                  )}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{fmtDate(row.entryDate)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{fmtPrice.format(row.weightedEntryPrice)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.exitPrice > 0 ? fmtPrice.format(row.exitPrice) : "—"}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.stopLossPct != null ? `${Math.abs(row.stopLossPct).toFixed(1)}%` : "—"}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.ageDays}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.allocationPct.toFixed(1)}%</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{showAmounts ? row.openQty : hiddenAmt}</td>
              <td className={`whitespace-nowrap px-3 py-3 font-medium ${pnlColor(row.pnlPct)}`}>{fmtPct(row.pnlPct)}</td>
              <td className={`whitespace-nowrap px-3 py-3 font-medium ${pnlColor(row.impactPct)}`}>{fmtPct(row.impactPct)}</td>
              <td className="whitespace-nowrap px-3 py-3">
                {row.reviewed ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600" title="Reviewed">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-300" title="Not reviewed">
                    <Circle className="h-4 w-4" />
                  </span>
                )}
              </td>
            </tr>
            );
          })}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={11} className="px-3 py-8 text-center text-slate-400">No trades found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
