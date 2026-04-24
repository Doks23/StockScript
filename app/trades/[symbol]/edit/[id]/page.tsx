import { notFound } from "next/navigation";
import { TradeForm } from "@/components/trade-form";
import { getCompetitions } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";

export default async function EditTradePage({
  params,
}: {
  params: { id: string; symbol: string };
}) {
  const user = await requireActiveUser();
  const competitions = await getCompetitions();

  const trade = await prisma.trade.findUnique({
    where: { id: params.id, userId: user.id },
    include: { transactions: { orderBy: { dateTime: "asc" } } },
  });

  if (!trade) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-[#e2d6b1] bg-white/95 p-7 shadow-soft">
        <p className="text-sm uppercase tracking-[0.22em] text-[#9d7a1f]">Edit Trade</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Update Journal Entry</h1>
      </section>

      <TradeForm
        competitions={competitions.map((comp) => ({
          id: comp.id,
          name: comp.name,
        }))}
        initialData={trade}
      />
    </div>
  );
}
