/**
 * /api/trades/excursions
 * ─────────────────────────────────────────────────────────────────────
 * MAE / MFE, measured on Dhan's 1-minute bars and stored on each trade
 * (lib/excursion-store.ts).
 *
 *   GET   ?year=2026   what is stored - no token, no Dhan request. `missing`
 *                      counts positions a refresh would measure.
 *   POST  { accessToken, scope, after }   measure on Dhan and store, one batch.
 *                      scope "pending": closed trades not yet measured or
 *                      changed since, plus every open position; scope "open":
 *                      open positions only. Call again with `after: next` until
 *                      `next` is null. The token is never stored.
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { DhanApiError, DhanAuthError } from "@/lib/brokers/dhan";
import { DhanDataAccessError } from "@/lib/brokers/dhan-charts";
import { readExcursions, refreshExcursions } from "@/lib/excursion-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const user = await requireActiveUser();
    const yearParam = new URL(request.url).searchParams.get("year");
    const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
    return NextResponse.json(await readExcursions(user.id, year));
  } catch (error) {
    return handleApiError(error, "Unable to load MAE / MFE.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const body = (await request.json().catch(() => ({}))) as {
      accessToken?: string;
      scope?: string;
      after?: string | null;
    };

    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (!accessToken) {
      return NextResponse.json(
        { error: "A Dhan access token is required - MAE / MFE is measured on Dhan's 1-minute bars." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await refreshExcursions({
        userId: user.id,
        accessToken,
        scope: body.scope === "open" ? "open" : "pending",
        after: typeof body.after === "string" && body.after ? body.after : null,
      }),
    );
  } catch (error) {
    if (error instanceof DhanAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DhanDataAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DhanApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error, "Unable to update MAE / MFE.");
  }
}
