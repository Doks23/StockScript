"use client";

import React, { useState, useMemo } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { GroupedTradeRow } from "@/lib/trade-utils";

const fmtPrice = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const pnlColor = (n: number) => n > 0 ? "text-emerald-600" : n < 0 ? "text-red-500" : "text-slate-400";

type SortKey =
  | "symbol"
  | "avgEntryPrice"
  | "avgExitPrice"
  | "stopLossPct"
  | "ageDays"
  | "allocationPct"
  | "openQty"
  | "pnlPct"
  | "impactPct";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="inline ml-0.5 h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ArrowUp className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />
    : <ArrowDown className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />;
}

export function SimpleJournalTable({ rows }: { rows: GroupedTradeRow[] }) {
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
        case "avgEntryPrice": av = a.weightedEntryPrice; bv = b.weightedEntryPrice; break;
        case "avgExitPrice": av = a.exitPrice; bv = b.exitPrice; break;
        case "stopLossPct": av = a.stopLossPct ?? 0; bv = b.stopLossPct ?? 0; break;
        case "ageDays": av = a.ageDays; bv = b.ageDays; break;
        case "allocationPct": av = a.allocationPct; bv = b.allocationPct; break;
        case "openQty": av = a.openQty; bv = b.openQty; break;
        case "pnlPct": av = a.pnlPct; bv = b.pnlPct; break;
        case "impactPct": av = a.impactPct; bv = b.impactPct; break;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir]);

  function th(key: SortKey, label: string, className = "") {
    return (
      <th
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-100 ${className}`}
        onClick={() => handleSort(key)}
      >
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line bg-slate-50">
            {th("symbol", "Symbol")}
            {th("avgEntryPrice", "Avg Entry")}
            {th("avgExitPrice", "Avg Exit")}
            {th("stopLossPct", "SL %")}
            {th("ageDays", "Age (d)")}
            {th("allocationPct", "Alloc %")}
            {th("openQty", "Open Qty")}
            {th("pnlPct", "PNL %")}
            {th("impactPct", "Impact %")}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sortedRows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
              <td className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-ink">{row.symbol}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-700">{fmtPrice.format(row.weightedEntryPrice)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-700">{row.exitPrice > 0 ? fmtPrice.format(row.exitPrice) : "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-700">{row.stopLossPct != null ? `${row.stopLossPct.toFixed(1)}%` : "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-700">{row.ageDays}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-700">{row.allocationPct.toFixed(1)}%</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-700">{row.openQty}</td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-sm font-medium ${pnlColor(row.pnlPct)}`}>{fmtPct(row.pnlPct)}</td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-sm font-medium ${pnlColor(row.impactPct)}`}>{fmtPct(row.impactPct)}</td>
            </tr>
          ))}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">No trades found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
