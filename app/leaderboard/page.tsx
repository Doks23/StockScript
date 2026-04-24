import Link from "next/link";
import { Medal, TrendingUp, Award } from "lucide-react";
import { requireActiveUser } from "@/lib/auth";
import { formatDateValue, formatPercent } from "@/lib/format";
import { getCompetitions, getLeaderboard } from "@/lib/queries";
import { JoinButton } from "@/components/join-button";

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
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-[36px] border border-white/70 bg-[linear-gradient(135deg,rgba(15,23,32,0.96),rgba(49,91,74,0.88))] p-7 text-white shadow-soft">
        <p className="text-sm uppercase tracking-[0.24em] text-white/60">
          Leaderboard
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold">
          Ranked by Portfolio Impact %
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-white/70">
          Competitions score all trades inside the date window. Traders are
          ranked by total portfolio return — no absolute ₹ values, so any
          account size competes on equal footing.
        </p>
      </section>

      {/* Competition selector */}
      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
        <form className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              Competition
            </label>
            <select
              name="competitionId"
              defaultValue={selectedCompetitionId}
              className="form-input w-full"
            >
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition"
          >
            Load
          </button>
          {selectedCompetition &&
            (alreadyJoined ? (
              <button
                type="button"
                disabled
                className="rounded-xl bg-emerald-100 border border-emerald-200 px-5 py-2.5 text-sm font-medium text-emerald-700 opacity-80 cursor-not-allowed transition"
              >
                Joined
              </button>
            ) : pendingRequest ? (
              <button
                type="button"
                disabled
                className="rounded-xl bg-amber-100 border border-amber-200 px-5 py-2.5 text-sm font-medium text-amber-700 opacity-80 cursor-not-allowed transition"
              >
                Pending Approval
              </button>
            ) : (
              <JoinButton competitionId={selectedCompetition.id} />
            ))}
        </form>
      </section>

      {leaderboard ? (
        <>
          {/* Competition stats */}
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Window
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-800">
                {formatDateValue(leaderboard.competition.startDate)} →{" "}
                {formatDateValue(leaderboard.competition.endDate)}
              </p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Qualified Traders
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-800">
                {leaderboard.entries.length}
              </p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Ranking Basis
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-6">
                Total P&amp;L ÷ max capital deployed (Portfolio Impact %).
              </p>
            </div>
          </section>

          {/* Top 3 podium */}
          {leaderboard.entries.length > 0 && (
            <section className="grid gap-4 md:grid-cols-3">
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
                    className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
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

          {/* Full rankings table */}
          <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="bg-accent text-white text-[11px] uppercase tracking-wider">
                    <th className="px-5 py-3 text-left w-16">Rank</th>
                    <th className="px-5 py-3 text-left">Trader</th>
                    <th className="px-5 py-3 text-right">Portfolio Impact %</th>
                    <th className="px-5 py-3 text-right">PnL %</th>
                    <th className="px-5 py-3 text-right">Win Rate</th>
                    <th className="px-5 py-3 text-right">Trades</th>
                    <th className="px-5 py-3 text-right">Max DD %</th>
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
                          className="hover:text-blue-600 transition-colors"
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
                      <td className="px-5 py-4 text-right text-slate-600">
                        {formatPercent(entry.maxDrawdown)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Link
                          href={`/leaderboard/${selectedCompetitionId}/${entry.userId}`}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-amber-400 hover:text-amber-700 transition"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {leaderboard.entries.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
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
      ) : (
        <section className="rounded-[22px] border border-slate-200 bg-white p-12 text-center text-slate-400 shadow-sm">
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
