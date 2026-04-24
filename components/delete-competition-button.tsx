"use client";

import { deleteCompetition } from "@/lib/actions"; // Import the server action

interface DeleteCompetitionButtonProps {
  competitionId: string;
  competitionName: string;
}

export function DeleteCompetitionButton({
  competitionId,
  competitionName,
}: DeleteCompetitionButtonProps) {
  return (
    <form action={deleteCompetition}>
      <input type="hidden" name="competitionId" value={competitionId} />
      <button
        type="submit"
        className="text-red-600 hover:text-red-700 font-semibold transition"
        onClick={(e) => {
          if (
            !confirm(
              `Are you sure you want to delete competition "${competitionName}"? This action cannot be undone.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        Delete
      </button>
    </form>
  );
}
