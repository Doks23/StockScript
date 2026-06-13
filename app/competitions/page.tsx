import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { getCompetitions, getAllTraders } from "@/lib/queries";
import { formatDateValue } from "@/lib/format";
import { DeleteCompetitionButton } from "@/components/delete-competition-button";
import { CompetitionRequestList } from "@/components/competition-request-list";
import { TraderMaintenanceTable } from "@/components/trader-maintenance-table";
import { prisma } from "@/lib/prisma";

type Props = { searchParams: { tab?: string } };

export default async function CompetitionsManagementPage({ searchParams }: Props) {
  const user = await requireActiveUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_TRADER") {
    redirect("/dashboard");
  }
  const isAdmin = user.role === "ADMIN";
  const canCreateCompetition = user.role === "ADMIN" || user.role === "SUPER_TRADER";

  const activeTab = searchParams.tab === "maintenance" ? "maintenance" : "competitions";

  const [competitions, pendingRequests, traders] = await Promise.all([
    getCompetitions(),
    prisma.competitionRequest.findMany({
      where: { status: "PENDING" },
      include: { user: true, competition: true },
      orderBy: { createdAt: "asc" },
    }),
    activeTab === "maintenance" ? getAllTraders() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Header */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 sm:text-sm">Admin</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:mt-2 sm:text-4xl">Competitions</h1>
        </div>
        {activeTab === "competitions" && canCreateCompetition && (
          <Link
            href="/competitions/new"
            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-accentDeep"
          >
            Create New Competition
          </Link>
        )}
      </section>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-line bg-canvas p-1 w-fit">
        <Link
          href="/competitions"
          className={`rounded-xl px-5 py-2 text-sm font-medium transition ${
            activeTab === "competitions"
              ? "bg-white text-ink shadow-sm"
              : "text-slate-500 hover:text-ink"
          }`}
        >
          Competitions
        </Link>
        <Link
          href="/competitions?tab=maintenance"
          className={`rounded-xl px-5 py-2 text-sm font-medium transition ${
            activeTab === "maintenance"
              ? "bg-white text-ink shadow-sm"
              : "text-slate-500 hover:text-ink"
          }`}
        >
          Maintenance
        </Link>
      </div>

      {activeTab === "competitions" ? (
        <>
          {pendingRequests.length > 0 && (
            <CompetitionRequestList requests={pendingRequests} />
          )}

          <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 font-display text-xl font-semibold text-ink sm:text-2xl">All Competitions</h2>
            <div className="space-y-4">
              {competitions.length === 0 && (
                <p className="py-8 text-center text-slate-400 italic">
                  No competitions yet.{" "}
                  {canCreateCompetition && (
                    <Link href="/competitions/new" className="font-medium text-accent hover:underline">
                      Create one →
                    </Link>
                  )}
                </p>
              )}
              {competitions.map((competition) => (
                <div
                  key={competition.id}
                  className="rounded-2xl border border-line bg-canvas p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-ink sm:text-lg">{competition.name}</h3>
                      <p className="text-xs text-slate-500 sm:text-sm">
                        {formatDateValue(competition.startDate)} to{" "}
                        {formatDateValue(competition.endDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/leaderboard?competitionId=${competition.id}`}
                        className="text-sm font-medium text-accent hover:text-accentDeep"
                      >
                        View Leaderboard
                      </Link>
                      {isAdmin && (
                        <DeleteCompetitionButton
                          competitionId={competition.id}
                          competitionName={competition.name}
                        />
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-semibold text-slate-600">
                      Participants ({competition.participants.length})
                    </h4>
                    {competition.participants.length > 0 ? (
                      <ul className="list-inside list-disc text-sm text-slate-500">
                        {competition.participants.map((p) => (
                          <li key={p.userId}>
                            {p.user.name} ({p.user.email})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm italic text-slate-400">No participants yet.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="px-6 py-5 border-b border-line">
            <h2 className="font-display text-2xl font-semibold text-ink">Trader Accounts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Approve, reject, or remove trader accounts.
            </p>
          </div>
          <TraderMaintenanceTable traders={traders} />
        </section>
      )}
    </div>
  );
}
