import Link from "next/link";
import { requireActiveUser } from "@/lib/auth";
import { PortfolioCapitalEditor } from "@/components/portfolio-capital-editor";
import { DashboardPageClient } from "@/components/dashboard-page-client";
import { getDashboardData } from "@/lib/queries";

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const dashboard = await getDashboardData(user.id);

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-2xl border border-line bg-panel px-4 py-4 shadow-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {user.name}
            </h1>
            <div className="flex gap-2">
              <Link
                href="/trades"
                className="rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 sm:text-sm"
              >
                Journal
              </Link>
              <Link
                href="/trades/new"
                className="rounded-full bg-gradient-to-r from-accent to-accentDeep px-3 py-1.5 text-xs font-medium text-white transition hover:shadow-md sm:text-sm"
              >
                New trade
              </Link>
            </div>
          </div>

          <div className="w-full md:w-auto md:min-w-[280px] rounded-2xl border border-line bg-canvas p-3 shadow-inner sm:p-4">
            <PortfolioCapitalEditor initialCapital={user.portfolioCapital} />
          </div>
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
