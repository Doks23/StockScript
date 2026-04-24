import { requireAdmin } from "@/lib/auth";
import { CompetitionForm } from "@/components/competition-form";
import Link from "next/link";

export default async function NewCompetitionPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <section className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
            Admin
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-ink">
            Create Competition
          </h1>
        </div>
        <Link
          href="/competitions"
          className="text-sm font-medium text-slate-500 hover:text-ink"
        >
          ← Back to Competitions
        </Link>
      </section>

      <CompetitionForm />
    </div>
  );
}
