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
      <section className="rounded-[36px] border border-[#e2d6b1] bg-[linear-gradient(135deg,rgba(112,79,7,0.96),rgba(178,136,27,0.88))] p-8 text-white shadow-soft">
        <p className="text-sm uppercase tracking-[0.24em] text-white/70">Account Recovery</p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-tight">
          Reset your trading account password.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-white/80">
          Enter your email address and we'll send you a link to reset your password securely.
        </p>
      </section>
      <ForgotPasswordForm />
    </div>
  );
}
