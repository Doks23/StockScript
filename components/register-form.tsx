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
      className="space-y-5 rounded-[32px] border border-line bg-panel p-8 shadow-soft"
    >
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-accent">Register</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Create trader account</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
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
