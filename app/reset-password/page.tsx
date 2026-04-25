import { ResetPasswordForm } from "@/components/reset-password-form";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const user = await getCurrentUser();

  if (user?.isActive) {
    redirect("/trades");
  }

  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[36px] border border-[#e2d6b1] bg-[linear-gradient(135deg,rgba(112,79,7,0.96),rgba(178,136,27,0.88))] p-8 text-white shadow-soft">
        <p className="text-sm uppercase tracking-[0.24em] text-white/70">Account Recovery</p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-tight">
          Create a new password.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-white/80">
          Set a strong, new password for your trading account. Make sure it's at least 8 characters long.
        </p>
      </section>
      <Suspense fallback={<div className="rounded-[32px] border border-[#e4d8b7] bg-white/95 p-8 shadow-soft">Loading...</div>}>
        <ResetPasswordForm token={token} />
      </Suspense>
    </div>
  );
}
