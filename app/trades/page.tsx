import { requireActiveUser } from "@/lib/auth";
import { getJournalData } from "@/lib/queries";
import { JournalTable } from "@/components/journal-table";
import { JournalFilters } from "@/components/journal-filters";
import Link from "next/link";

type TradesPageProps = {
  searchParams: {
    from?: string;
    to?: string;
    symbol?: string;
    tag?: string;
    status?: string;
    minQty?: string;
    sort?: string;
    hideAmounts?: string;
  };
};

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const user = await requireActiveUser();
  const effectiveStatus = searchParams.status ?? "OPEN";
  const showAmounts = searchParams.hideAmounts !== "1";

  const journal = await getJournalData(user.id, { ...searchParams, status: effectiveStatus });

  const filtersKey = [
    searchParams.symbol,
    searchParams.status,
    searchParams.from,
    searchParams.to,
    searchParams.minQty,
    searchParams.sort,
    searchParams.hideAmounts,
  ].join("|");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <JournalFilters
          key={filtersKey}
          defaults={{ ...searchParams, status: effectiveStatus }}
        />
      </section>

      {/* Journal table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
        <JournalTable rows={journal.groupedRows} showAmounts={showAmounts} />
      </section>

      {/* Action bar */}
      <div className="flex flex-wrap gap-3">
        <Link href="/trades/new" className="journal-action-btn">
          + New Trade
        </Link>
        <Link href="/dashboard" className="journal-action-btn">
          Dashboard
        </Link>
        <Link href="/leaderboard" className="journal-action-btn">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
