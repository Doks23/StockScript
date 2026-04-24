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
      <section className="rounded-[20px] border border-[#e2d6b1] bg-white/95 px-6 py-4 shadow-soft">
        <p className="text-sm uppercase tracking-[0.24em] text-[#9d7a1f] font-medium">Trade Entry</p>
      </section>

      <TradeEntryTabs
        manualForm={<TradeForm competitions={competitionList} />}
        importForm={<CSVImport competitions={competitionList} />}
      />
    </div>
  );
}
