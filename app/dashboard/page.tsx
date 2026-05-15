import Link from "next/link";
import { requireActiveUser } from "@/lib/auth";
import { PortfolioCapitalEditor } from "@/components/portfolio-capital-editor";
import { DashboardPageClient } from "@/components/dashboard-page-client";
import { getDashboardData } from "@/lib/queries";

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const dashboard = await getDashboardData(user.id);

  return (
    <div className="space-y-8">
      <section className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center rounded-3xl border border-line bg-panel px-6 py-6 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-5">
            <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">
              {user.name}
            </h1>
            <div className="flex gap-2">
              <Link
                href="/trades"
                className="rounded-full bg-canvas px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Journal
              </Link>
              <Link
                href="/trades/new"
                className="rounded-full bg-gradient-to-r from-accent to-accentDeep px-4 py-1.5 text-sm font-medium text-white transition hover:shadow-md"
              >
                New trade
              </Link>
            </div>
          </div>
        </div>

        <div className="w-full md:w-auto rounded-2xl bg-canvas border border-line p-4 shadow-inner">
          <PortfolioCapitalEditor initialCapital={user.portfolioCapital} />
        </div>
      </section>

      <DashboardPageClient
        trades={dashboard.trades}
        userCapital={user.portfolioCapital}
        groupedTrades={dashboard.groupedTrades}
      />
    </div>
  );
}
