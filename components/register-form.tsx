"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to create account.");
      setIsSubmitting(false);
      return;
    }

    router.push("/pending-approval");
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-4 rounded-3xl border border-line bg-panel p-5 shadow-soft sm:space-y-5 sm:rounded-[32px] sm:p-8"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-accent sm:text-sm">Register</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:mt-3 sm:text-4xl">Create trader account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 sm:mt-3 sm:leading-7">
          Create your account. An admin will approve it before you can start trading.
        </p>
      </div>

      <label className="form-field">
        Full Name
        <input name="name" required className="form-input" />
      </label>

      <label className="form-field">
        Email ID
        <input name="email" type="email" required className="form-input" />
      </label>

      <label className="form-field">
        Password
        <input name="password" type="password" minLength={8} required className="form-input" />
      </label>

      {error ? (
        <p className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accentDeep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>

      <p className="text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-accent hover:text-accentDeep">
          Login
        </Link>
      </p>
    </form>
  );
}
