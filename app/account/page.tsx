import { requireActiveUser } from "@/lib/auth";
import { AccountPageClient } from "@/components/account-page-client";

export default async function AccountPage() {
  const user = await requireActiveUser();
  return <AccountPageClient user={user} />;
}
