"use client";

/**
 * Date range for the R-multiple page.
 *
 * Presets first, because "how have the last two weeks gone" is the question
 * actually being asked; custom dates exist for the times it is not.
 *
 * The range lives in the URL rather than in component state, so the server does
 * the filtering, a reload keeps the view, and a link to it carries the range.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { RANGE_PRESETS, type MonthOption } from "@/lib/r-range";

export function RMultipleRange({
  active,
  from,
  to,
  months,
  activeMonth,
}: {
  active: string;
  from: string;
  to: string;
  /** The last few calendar months, resolved on the server. */
  months: MonthOption[];
  activeMonth: string;
}) {
  const router = useRouter();
  const [custom, setCustom] = useState(active === "custom");
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);

  function applyCustom(nextFrom: string, nextTo: string) {
    setFromDate(nextFrom);
    setToDate(nextTo);
    // One end alone is a half-specified range; wait for both rather than
    // showing an empty chart the moment the first date is picked.
    if (!nextFrom || !nextTo) return;
    router.push(`/r-multiple?range=custom&from=${nextFrom}&to=${nextTo}`);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <nav className="flex flex-wrap justify-end gap-1.5">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => {
              setCustom(false);
              router.push(`/r-multiple?range=${preset.key}`);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              !custom && preset.key === active
                ? "bg-accent text-white"
                : "border border-line bg-white text-slate-600 hover:bg-canvas"
            }`}
          >
            {preset.label}
          </button>
        ))}
        {/* Named months sit after the rolling windows: "how did July go" is a
            different question from "the last 30 days", and both are asked. */}
        {months.map((month) => (
          <button
            key={month.key}
            type="button"
            onClick={() => {
              setCustom(false);
              router.push(`/r-multiple?range=month&m=${month.key}`);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              !custom && active === "month" && activeMonth === month.key
                ? "bg-accent text-white"
                : "border border-line bg-white text-slate-600 hover:bg-canvas"
            }`}
          >
            {month.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setCustom((open) => !open)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            custom || active === "custom"
              ? "bg-accent text-white"
              : "border border-line bg-white text-slate-600 hover:bg-canvas"
          }`}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          Custom
        </button>
      </nav>

      {(custom || active === "custom") && (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-line bg-white px-2.5 py-2">
          <label className="text-[11px] text-muted" htmlFor="r-from">
            From
          </label>
          <input
            id="r-from"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => applyCustom(event.target.value, toDate)}
            className="rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <label className="text-[11px] text-muted" htmlFor="r-to">
            To
          </label>
          <input
            id="r-to"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => applyCustom(fromDate, event.target.value)}
            className="rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-accent"
          />
        </div>
      )}
    </div>
  );
}
