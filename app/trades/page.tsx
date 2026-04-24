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
    hideAmounts?: string;
  };
};

export default async function TradesPage({ searchParams }: TradesPageProps) {
  const user = await requireActiveUser();
  const effectiveStatus = searchParams.status ?? "OPEN";
  const showAmounts = searchParams.hideAmounts !== "1";

  const journal = await getJournalData(user.id, {
    ...searchParams,
    status: effectiveStatus,
  });

  let defaultFrom = searchParams.from || "";
  let defaultTo = searchParams.to || "";

  if (!defaultFrom && journal.groupedRows.length > 0) {
    const min = Math.min(
      ...journal.groupedRows.map(
        (r) => r.entryLegs[0]?.dateTime?.getTime() ?? Date.now(),
      ),
    );
    if (!isNaN(min)) defaultFrom = new Date(min).toISOString().split("T")[0];
  }
  if (!defaultTo && journal.groupedRows.length > 0) {
    const max = Math.max(
      ...journal.groupedRows.map(
        (r) =>
          r.exitDateTime?.getTime() ?? r.entryLegs[0]?.dateTime?.getTime() ?? 0,
      ),
    );
    if (max > 0 && !isNaN(max))
      defaultTo = new Date(max).toISOString().split("T")[0];
  }

  const filtersKey = [
    searchParams.symbol,
    searchParams.status,
    searchParams.from,
    searchParams.to,
    searchParams.hideAmounts,
  ].join("|");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <JournalFilters
          key={filtersKey}
          defaults={{
            ...searchParams,
            status: effectiveStatus,
            from: defaultFrom,
            to: defaultTo,
          }}
        />
      </section>

      {/* Journal table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
        <JournalTable rows={journal.groupedRows} showAmounts={showAmounts} />
      </section>
    </div>
  );
}
