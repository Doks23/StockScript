/**
 * POST /api/symbol-map/backfill
 * ─────────────────────────────────────────────────────────────────────
 * Names every journal symbol the way TradingView does, from Dhan's published
 * security list.
 *
 * This exists because the mapping used to be written only as a side effect of
 * committing a Dhan sync. A journal built from CSV imports, or one that simply
 * had not synced since the mapping was added, kept showing the broker's company
 * name collapsed to a pseudo-ticker ("VA TECH WABAG" rendered as VATECHWABAG,
 * which charts nothing) with no way to fix it short of typing each one in.
 *
 * Nothing already mapped is touched - a hand-set ticker outranks anything
 * inferred here - and symbols the master has no exact match for are returned
 * rather than guessed at, so the user can map those few by hand.
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { getScripMaster, ScripMasterError } from "@/lib/brokers/dhan-scrip-master";
import { backfillTradingViewTickers } from "@/lib/symbol-map-backfill";

/** The security list is ~25MB on a cold instance; the query either side is small. */
export const maxDuration = 120;

export async function POST() {
  try {
    const user = await requireActiveUser();

    const master = await getScripMaster();
    const { added, unmapped } = await backfillTradingViewTickers(user.id, master);

    return NextResponse.json({ added, unmapped, checked: master.rows.length });
  } catch (error) {
    if (error instanceof ScripMasterError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error, "Could not map journal symbols to TradingView tickers.");
  }
}
