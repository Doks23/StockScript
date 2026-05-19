import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
      <RegisterForm />
      <section className="order-first rounded-3xl border border-line bg-canvas p-6 shadow-soft sm:p-8 lg:order-none lg:rounded-[36px]">
        <p className="text-xs uppercase tracking-[0.2em] text-accent sm:text-sm sm:tracking-[0.24em]">
          New Trader Onboarding
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink sm:mt-3 sm:text-4xl lg:text-5xl">
          Create your journal identity.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate-700 sm:mt-5 sm:text-base sm:leading-8">
          Register with your email ID and password, verify the email, then wait
          for admin approval. After approval, your account becomes active for
          trading journal entries and competition participation.
        </p>
      </section>
    </div>
  );
}
