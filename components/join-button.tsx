"use client";

import { useTransition } from "react";
import { requestToJoinCompetition } from "@/lib/actions";

interface JoinButtonProps {
  competitionId: string;
}

export function JoinButton({ competitionId }: JoinButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("competitionId", competitionId);
      await requestToJoinCompetition(formData);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? "Requesting..." : "Request to Join"}
    </button>
  );
}
