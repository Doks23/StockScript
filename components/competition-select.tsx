"use client";

import { useRouter } from "next/navigation";

export function CompetitionSelect({
  competitions,
  selectedId,
}: {
  competitions: { id: string; name: string }[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedId}
      onChange={(e) => router.push(`/leaderboard?competitionId=${e.target.value}`)}
      className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-slate-700 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
    >
      {competitions.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
