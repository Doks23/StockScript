/**
 * Browser side of the MAE / MFE refresh: keeps asking the route for batches
 * until every symbol is measured and stored. Used by the MAE / MFE tab's Update
 * button, and after a Dhan sync or an EOD price refresh so the stored numbers
 * keep up without anyone opening the tab.
 */

import type { ExcursionProblem, RefreshScope } from "@/lib/excursion-store";

export type RefreshProgress = { measured: number; remaining: number };

export async function runExcursionRefresh(
  accessToken: string,
  scope: RefreshScope,
  onProgress?: (progress: RefreshProgress) => void,
): Promise<{ measured: number; problems: ExcursionProblem[] }> {
  let after: string | null = null;
  let measured = 0;
  const problems: ExcursionProblem[] = [];

  do {
    const response = await fetch("/api/trades/excursions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, scope, after }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Could not update MAE / MFE.");

    measured += body.measured as number;
    problems.push(...(body.problems as ExcursionProblem[]));
    onProgress?.({ measured, remaining: body.remaining as number });
    after = body.next as string | null;
  } while (after !== null);

  return { measured, problems };
}
