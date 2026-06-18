import Link from "next/link";
import { Medal, TrendingUp, Award } from "lucide-react";
import { requireActiveUser } from "@/lib/auth";
import { formatDateValue, formatPercent } from "@/lib/format";
import { getCompetitions, getLeaderboard } from "@/lib/queries";
import { JoinButton } from "@/components/join-button";
import { CompetitionSelect } from "@/components/competition-select";

type LeaderboardPageProps = {
  searchParams: { competitionId?: string };
};

export default async function LeaderboardPage({
  searchParams,
}: LeaderboardPageProps) {
  const user = await requireActiveUser();
  const competitions = await getCompetitions();
  const selectedCompetitionId =
    searchParams.competitionId ?? competitions[0]?.id;
  const leaderboard = selectedCompetitionId
    ? await getLeaderboard(selectedCompetitionId)
    : null;

  const selectedCompetition = competitions.find(
    (c) => c.id === selectedCompetitionId,
  );
  const alreadyJoined = selectedCompetition?.participants.some(
    (p) => p.userId === user.id,
  );
  const pendingRequest = selectedCompetition?.requests.some(
    (r) => r.userId === user.id,
  );

  const rankIcons = [Medal, TrendingUp, Award];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Competition card: selector + stats */}
      <section className="rounded-2xl border border-line bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr_1fr] sm:gap-5">
          <div className="max-w-xs">
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              Competition
            </label>
            <CompetitionSelect
              competitions={competitions}
              selectedId={selectedCompetitionId ?? ""}
            />
          </div>
          {leaderboard ? (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 sm:text-xs">
                  Window
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 sm:text-lg">
                  {formatDateValue(leaderboard.competition.startDate)} →{" "}
                  {formatDateValue(leaderboard.competition.endDate)}
                </p>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 sm:text-xs">
                    Qualified Traders
                  </p>
                  <p className="mt-0.5 text-2xl font-bold text-slate-800 sm:text-3xl">
                    {leaderboard.entries.length}
                  </p>
                </div>
                <div className="shrink-0 pt-4">
                  {selectedCompetition &&
                    (alreadyJoined ? (
                      <button
                        type="button"
                        disabled
                        className="rounded-xl bg-emerald-100 border border-emerald-200 px-4 py-2 text-xs font-medium text-emerald-700 opacity-80 cursor-not-allowed transition"
                      >
                        Joined
                      </button>
                    ) : pendingRequest ? (
                      <button
                        type="button"
                        disabled
                        className="rounded-xl bg-amber-100 border border-amber-200 px-4 py-2 text-xs font-medium text-amber-700 opacity-80 cursor-not-allowed transition"
                      >
                        Pending
                      </button>
                    ) : (
                      <JoinButton competitionId={selectedCompetition.id} />
                    ))}
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-2 flex items-center text-sm text-slate-400">
              Select a competition to view details
            </div>
          )}
        </div>
      </section>

      {leaderboard && (<>
        {/* Top 3 podium */}
          {leaderboard.entries.length > 0 && (
            <section className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
              {leaderboard.entries.slice(0, 3).map((entry, i) => {
                const Icon = rankIcons[i] ?? Award;
                const medalColor =
                  i === 0
                    ? "text-amber-500"
                    : i === 1
                      ? "text-slate-400"
                      : "text-amber-700";
                return (
                  <article
                    key={entry.userId}
                    className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
                        #{entry.rank}
                      </span>
                      <Icon className={`h-6 w-6 ${medalColor}`} />
                    </div>
                    <p className="mt-4 font-display text-xl font-semibold text-slate-800">
                      {entry.userName}
                    </p>
                    <p
                      className={`mt-1 text-3xl font-bold ${entry.portfolioImpactPct >= 0 ? "text-emerald-600" : "text-red-500"}`}
                    >
                      {formatPercent(entry.portfolioImpactPct)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 uppercase tracking-wider">
                      Portfolio Impact
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-slate-500 text-xs">Win Rate</p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {formatPercent(entry.winRate)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-slate-500 text-xs">Trades</p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {entry.totalTrades}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {/* Mobile rankings card list */}
          <section className="space-y-2 sm:hidden">
            {leaderboard.entries.map((entry) => (
              <Link
                key={entry.userId}
                href={`/leaderboard/${selectedCompetitionId}/${entry.userId}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm active:bg-canvas"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                  {entry.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {entry.userName}
                  </p>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-500">
                    <span>Win {formatPercent(entry.winRate)}</span>
                    <span>•</span>
                    <span>{entry.totalTrades} trades</span>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-base font-bold tabular-nums ${
                      entry.portfolioImpactPct >= 0
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {formatPercent(entry.portfolioImpactPct)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Impact
                  </p>
                </div>
              </Link>
            ))}
            {leaderboard.entries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line bg-white py-10 text-center text-sm text-slate-400">
                No qualifying traders yet.
              </div>
            )}
          </section>

          {/* Full rankings table (desktop) */}
          <section className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider">
                    <th className="px-5 py-3 text-left w-16">Rank</th>
                    <th className="px-5 py-3 text-left">Trader</th>
                    <th className="px-5 py-3 text-right">Portfolio Impact %</th>
                    <th className="px-5 py-3 text-right">PnL %</th>
                    <th className="px-5 py-3 text-right">Win Rate</th>
                    <th className="px-5 py-3 text-right">Trades</th>
                    <th className="px-5 py-3 text-center">Trades Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaderboard.entries.map((entry) => (
                    <tr
                      key={entry.userId}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-5 py-4 font-bold text-slate-800 text-base">
                        #{entry.rank}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        <Link
                          href={`/leaderboard/${selectedCompetitionId}/${entry.userId}`}
                          className="hover:text-accent transition-colors"
                        >
                          {entry.userName}
                        </Link>
                      </td>
                      <td
                        className={`px-5 py-4 text-right font-bold text-base ${entry.portfolioImpactPct >= 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {formatPercent(entry.portfolioImpactPct)}
                      </td>
                      <td className="px-5 py-4 text-right text-slate-600">
                        {formatPercent(entry.returnPercentage)}
                      </td>
                      <td className="px-5 py-4 text-right text-slate-600">
                        {formatPercent(entry.winRate)}
                      </td>
                      <td className="px-5 py-4 text-right text-slate-600">
                        {entry.totalTrades}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Link
                          href={`/leaderboard/${selectedCompetitionId}/${entry.userId}`}
                          className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-accent hover:text-accent transition"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {leaderboard.entries.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-12 text-center text-slate-400"
                      >
                        No qualifying traders yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {competitions.length === 0 && (
        <section className="rounded-2xl border border-line bg-white p-12 text-center text-slate-400 shadow-sm">
          No competitions available yet.
          {user.role === "ADMIN" && (
            <Link
              href="/competitions"
              className="ml-2 font-semibold text-amber-700 hover:text-amber-600"
            >
              Create one →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
