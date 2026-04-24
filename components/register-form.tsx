"use client";

import Link from "next/link";
import { useState } from "react";

export function RegisterForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<null | { verificationUrl: string }>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    setSuccess(null);
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

    setSuccess({
      verificationUrl: result.verificationUrl,
    });
    setIsSubmitting(false);
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-5 rounded-[32px] border border-[#e4d8b7] bg-white/95 p-8 shadow-soft"
    >
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-[#9d7a1f]">Register</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Create trader account</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Your email must be verified first. After that, the admin approves the trader account before trade posting is enabled.
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

      {success ? (
        <div className="space-y-3 rounded-2xl border border-profit/25 bg-profit/10 px-4 py-4 text-sm text-slate-700">
          <p>Your account has been created. Verify the email to continue.</p>
          <Link
            href={success.verificationUrl}
            className="inline-flex rounded-full bg-[#a7770e] px-4 py-2 font-medium text-white"
          >
            Verify email now
          </Link>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[#a7770e] px-4 py-3 font-medium text-white transition hover:bg-[#8e6500] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>

      <p className="text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-[#8e6500] hover:text-[#6b4c00]">
          Login
        </Link>
      </p>
    </form>
  );
}
