import { TradesPageClient } from "@/components/trades-page-client";
import { requireActiveUser } from "@/lib/auth";
import { getCompetitions } from "@/lib/queries";

export default async function TradesPage() {
  await requireActiveUser();

  // Needed by the Dhan sync in the journal ribbon, which can tag an import with
  // a competition the same way the full import page does.
  const competitions = await getCompetitions();

  return (
    <TradesPageClient
      competitions={competitions.map((competition) => ({
        id: competition.id,
        name: competition.name,
      }))}
    />
  );
}
