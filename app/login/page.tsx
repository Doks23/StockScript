import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user?.isActive) {
    redirect("/trades");
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
      {/* Form first on mobile; hero second */}
      <LoginForm />
      <section className="order-first rounded-3xl border border-line bg-canvas p-6 shadow-soft sm:p-8 lg:order-none lg:rounded-[36px]">
        <p className="text-xs uppercase tracking-[0.2em] text-accent sm:text-sm sm:tracking-[0.24em]">
          Trading Journal Access
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink sm:mt-3 sm:text-4xl lg:text-5xl">
          Verified trader accounts, fair leaderboard math.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate-700 sm:mt-5 sm:text-base sm:leading-8">
          Each trader maintains their own journal. Closed trades feed the
          competition engine and the leaderboard ranks only by portfolio return
          percentage.
        </p>
      </section>
    </div>
  );
}
