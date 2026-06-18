import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "default" | "profit" | "loss" | "warning";
  compact?: boolean;
  className?: string;
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  compact = false,
  className = "",
}: MetricCardProps) {
  const toneBorder =
    tone === "warning" ? "border-amber-200" : "border-line";

  const valueClass =
    tone === "profit"
      ? "text-profit"
      : tone === "loss"
        ? "text-loss"
        : tone === "warning"
          ? "text-amber-600"
          : "text-ink";

  return (
    <article
      className={`border ${toneBorder} bg-white shadow-soft transition-all duration-200 cursor-default ${
        compact
          ? "rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2"
          : "rounded-2xl px-4 py-3 hover:shadow-md sm:px-5 sm:py-4"
      } ${className}`}
    >
      <p
        className={`uppercase text-slate-500 ${
          compact
            ? "text-[9px] font-medium tracking-[0.12em]"
            : "text-[10px] tracking-[0.18em] sm:text-xs sm:tracking-[0.2em]"
        }`}
      >
        {label}
      </p>
      <p
        className={`font-display font-semibold ${valueClass} ${
          compact
            ? "mt-0 text-sm sm:text-base"
            : "mt-1 text-xl sm:mt-2 sm:text-2xl"
        }`}
      >
        {value}
      </p>
      {detail ? (
        typeof detail === "string" ? (
          <p className="mt-0.5 text-[10px] leading-tight text-slate-500 sm:text-xs">
            {detail}
          </p>
        ) : (
          <div className="mt-0.5 text-[10px] leading-tight text-slate-500 sm:text-xs">
            {detail}
          </div>
        )
      ) : null}
    </article>
  );
}
