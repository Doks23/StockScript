"use client";

/**
 * The one-line journal summary: how many trades are in view and what they add
 * up to. Lives in its own file because the full journal and the simple journal
 * both show it, and the two are read side by side - the numbers have to match
 * digit for digit, not merely agree.
 */

export type JournalMetrics = {
  totalTrades: number;
  totalAlloc: number;
  totalRealizedPnl: number;
  totalOpenPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  totalImpact: number;
};

const fmtAmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const pnlColor = (n: number) =>
  n > 0 ? "text-emerald-600" : n < 0 ? "text-red-500" : "text-slate-400";
const signedAmt = (n: number) => `${n >= 0 ? "+" : ""}${fmtAmt.format(n)}`;
const hiddenAmt = "•••";

function Stat({
  label,
  value,
  className = "text-slate-700",
  tip,
}: {
  label: string;
  value: string;
  className?: string;
  tip: string;
}) {
  return (
    <div className="tip flex items-center gap-1" data-tip={tip}>
      <span className="text-slate-500">{label}:</span>
      <span className={`font-semibold ${className}`}>{value}</span>
    </div>
  );
}

export function JournalMetricsBar({
  metrics,
  showAmounts = true,
}: {
  metrics: JournalMetrics;
  showAmounts?: boolean;
}) {
  const amount = (value: number) => (showAmounts ? signedAmt(value) : hiddenAmt);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-line bg-canvas px-4 py-2.5 text-[12px]">
      <span className="font-medium text-slate-400">
        {metrics.totalTrades} trade{metrics.totalTrades === 1 ? "" : "s"}
      </span>
      <Stat
        label="Alloc"
        value={fmtPct(metrics.totalAlloc)}
        tip="Share of portfolio capital tied up in these trades"
      />
      <Stat
        label="R"
        value={amount(metrics.totalRealizedPnl)}
        className={pnlColor(metrics.totalRealizedPnl)}
        tip="Realised P&L - booked on closed legs"
      />
      <Stat
        label="U"
        value={amount(metrics.totalUnrealizedPnl)}
        className={pnlColor(metrics.totalUnrealizedPnl)}
        tip="Unrealised P&L - open quantity at the last saved price"
      />
      <Stat
        label="MTM"
        value={amount(metrics.totalPnl)}
        className={pnlColor(metrics.totalPnl)}
        tip="Realised plus unrealised"
      />
      <Stat
        label="Impact"
        value={`${metrics.totalImpact >= 0 ? "+" : ""}${fmtPct(metrics.totalImpact)}`}
        className={pnlColor(metrics.totalImpact)}
        tip="What these trades did to the portfolio, in percent"
      />
    </div>
  );
}
