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
      className={`rounded-3xl border border-line bg-gradient-to-br ${toneClass} p-5 shadow-soft transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default`}
    >
      <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-4 font-display text-3xl font-semibold text-ink">{value}</p>
      {detail ? <p className="mt-2 text-sm text-slate-600">{detail}</p> : null}
    </article>
  );
}
