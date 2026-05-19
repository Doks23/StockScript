type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "profit" | "loss";
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: MetricCardProps) {
  const toneClass =
    tone === "profit"
      ? "from-profit/15 to-white"
      : tone === "loss"
        ? "from-loss/12 to-white"
        : "from-accent/12 to-white";

  return (
    <article
      className={`rounded-2xl border border-line bg-gradient-to-br ${toneClass} p-3 shadow-soft transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default sm:rounded-3xl sm:p-5`}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-sm sm:tracking-[0.2em]">
        {label}
      </p>
      <p className="mt-2 font-display text-lg font-semibold text-ink sm:mt-4 sm:text-3xl">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-xs text-slate-600 sm:mt-2 sm:text-sm">
          {detail}
        </p>
      ) : null}
    </article>
  );
}
