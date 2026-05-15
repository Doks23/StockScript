import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.isActive) {
    redirect("/pending-approval");
  }

  redirect("/trades");
}
