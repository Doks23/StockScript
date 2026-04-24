import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[36px] border border-[#e2d6b1] bg-[#fff8e8] p-8 shadow-soft">
        <p className="text-sm uppercase tracking-[0.24em] text-[#9d7a1f]">New Trader Onboarding</p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-tight text-ink">
          Create your journal identity.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-slate-700">
          Register with your email ID and password, verify the email, then wait for admin approval. After approval, your account becomes active for trading journal entries and competition participation.
        </p>
      </section>
      <RegisterForm />
    </div>
  );
}
