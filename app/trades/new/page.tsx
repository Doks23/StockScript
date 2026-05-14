import { TradeForm } from "@/components/trade-form";
import { CSVImport } from "@/components/csv-import";
import { requireActiveUser } from "@/lib/auth";
import { getCompetitions } from "@/lib/queries";
import { TradeEntryTabs } from "./trade-entry-tabs";

export default async function TradeEntryPage() {
  await requireActiveUser();
  const competitions = await getCompetitions();

  const competitionList = competitions.map((competition) => ({
    id: competition.id,
    name: competition.name,
  }));

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-white px-6 py-4 shadow-sm">
        <p className="text-sm uppercase tracking-wider text-accent font-medium">Trade Entry</p>
      </section>

      <TradeEntryTabs
        manualForm={<TradeForm competitions={competitionList} />}
        importForm={<CSVImport competitions={competitionList} />}
      />
    </div>
  );
}
