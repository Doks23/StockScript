import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageUpload } from "@/components/image-upload";
import { MetricCard } from "@/components/metric-card";
import { requireActiveUser } from "@/lib/auth";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { getTradesBySymbol } from "@/lib/queries";
import { parseTags, getWeightedEntryPrice, getWeightedExitPrice, getTotalEntryQty, getFirstEntryTime, getLastExitTime } from "@/lib/trade-utils";

type TradeDetailPageProps = {
  params: {
    symbol: string;
  };
  searchParams: {
    from?: string;
    to?: string;
    tag?: string;
  };
};

export default async function TradeDetailPage({ params, searchParams }: TradeDetailPageProps) {
  const user = await requireActiveUser();
  const data = await getTradesBySymbol(user.id, decodeURIComponent(params.symbol), searchParams);

  if (!data.trades.length) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[20px] border border-[#e2d6b1] bg-white/95 px-6 py-4 shadow-soft flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/trades" className="text-sm text-[#8e6500] hover:text-[#6b4c00]">
            ← Journal
          </Link>
          <h1 className="font-display text-xl font-semibold text-ink uppercase">{data.symbol}</h1>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Closed Trades" value={String(data.metrics.totalTrades)} />
        <MetricCard label="Open Trades" value={String(data.metrics.openTrades)} />
        <MetricCard label="Win Rate" value={formatPercent(data.metrics.winRate)} tone="profit" />
        <MetricCard
          label="Net Realized P&L"
          value={formatCurrency(data.metrics.totalNetPnl)}
          tone={data.metrics.totalNetPnl >= 0 ? "profit" : "loss"}
        />
      </section>

      <section className="space-y-6">
        {data.trades.map((trade) => (
          <article
            key={trade.id}
            className="rounded-[32px] border border-[#e2d6b1] bg-white/95 p-6 shadow-soft"
          >
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[#fff7dc] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#7b5a00]">
                      {trade.status}
                    </span>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white">
                      {trade.tradeType}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      {trade.segment}
                    </span>
                  </div>
                  <Link
                    href={`/trades/${encodeURIComponent(trade.symbol)}/edit/${trade.id}`}
                    className="rounded-full border border-[#eadfbe] bg-[#fffdfa] px-4 py-2 text-sm font-medium text-[#5f4b1f] hover:border-[#c59e32] hover:text-[#8d6500]"
                  >
                    Edit Trade
                  </Link>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="info-chip">
                    <p className="info-label">Entry</p>
                    <p className="info-value">{formatNumber(getWeightedEntryPrice(trade))}</p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Exit</p>
                    <p className="info-value">{getWeightedExitPrice(trade) > 0 ? formatNumber(getWeightedExitPrice(trade)) : "--"}</p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Closing Price</p>
                    <p className="info-value">{trade.closingPrice ? formatNumber(trade.closingPrice) : "--"}</p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Marked Price</p>
                    <p className="info-value">
                      {trade.closingPrice
                        ? formatNumber(trade.closingPrice)
                        : getWeightedExitPrice(trade) > 0
                        ? formatNumber(getWeightedExitPrice(trade))
                        : "--"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-[#f0e7cf] bg-[#fff9ec] p-4">
                    <p className="text-sm text-slate-500">Execution Window</p>
                    <p className="mt-3 text-sm leading-7 text-slate-700">
                      Entry: {formatDateTime(getFirstEntryTime(trade))}
                      <br />
                      Exit: {getLastExitTime(trade) ? formatDateTime(getLastExitTime(trade)!) : "Still open"}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-[#f0e7cf] bg-[#fff9ec] p-4">
                    <p className="text-sm text-slate-500">Notes & tags</p>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{trade.notes || "No notes added."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {parseTags(trade.tags).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-4">
                  <div className="info-chip">
                    <p className="info-label">Qty</p>
                    <p className="info-value">{formatNumber(getTotalEntryQty(trade))}</p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Capital</p>
                    <p className="info-value">{formatNumber(trade.capitalUsed)}</p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Charges</p>
                    <p className="info-value">{formatNumber(trade.charges)}</p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Realized P&L</p>
                    <p className={`info-value ${trade.netPnl >= 0 ? "text-profit" : "text-loss"}`}>
                      {formatCurrency(trade.netPnl)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <ImageUpload tradeId={trade.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {trade.images.map((image) => (
                    <div
                      key={image.id}
                      className="overflow-hidden rounded-[24px] border border-[#eadfbe] bg-[#fff9ec]"
                    >
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={image.imageUrl}
                          alt={`${trade.symbol} chart`}
                          fill
                          className="object-cover"
                        />
                      </div>
                    </div>
                  ))}
                  {!trade.images.length ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-[#fff9ec] px-5 py-8 text-sm text-slate-500 sm:col-span-2">
                      No chart screenshots attached yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
