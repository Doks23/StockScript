import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();

  if (user?.isActive) {
    redirect("/trades");
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[36px] border border-line bg-canvas p-8 shadow-soft">
        <p className="text-sm uppercase tracking-[0.24em] text-accent">Account Recovery</p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-tight text-ink">
          Reset your trading account password.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-slate-700">
          Enter your email address and we&apos;ll send you a link to reset your password securely.
        </p>
      </section>
      <ForgotPasswordForm />
    </div>
  );
}
