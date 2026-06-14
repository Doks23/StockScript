import { requireActiveUser } from "@/lib/auth";
import { PositionSizeCalculator } from "@/components/position-size-calculator";

export default async function PositionSizePage() {
  const user = await requireActiveUser();

  return <PositionSizeCalculator initialCapital={user.portfolioCapital} />;
}
