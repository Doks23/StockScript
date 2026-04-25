import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth";

export async function GET() {
  await destroySession();
  redirect("/login");
}
