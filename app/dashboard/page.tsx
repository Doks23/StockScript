import { requireActiveUser } from "@/lib/auth";
import { DashboardPageClient } from "@/components/dashboard-page-client";
import { getDashboardData } from "@/lib/queries";

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const dashboard = await getDashboardData(user.id);

  return (
    <DashboardPageClient
      trades={dashboard.trades as any}
      userName={user.name}
      userCapital={user.portfolioCapital}
    />
  );
}
