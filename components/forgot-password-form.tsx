"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: String(formData.get("email") || ""),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to process password reset request.");
      setIsSubmitting(false);
      return;
    }

    setSuccess("If an account exists with this email, a password reset link will be sent.");
    setIsSubmitting(false);
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-5 rounded-[32px] border border-line bg-panel p-8 shadow-soft"
    >
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-accent">Password Reset</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Recover your account</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Enter your registered email address and we&apos;ll send you a secure link to reset your password.
        </p>
      </div>

      <label className="form-field">
        Email ID
        <input name="email" type="email" required className="form-input" />
      </label>

      {error ? (
        <p className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-2xl border border-profit/30 bg-profit/10 px-4 py-3 text-sm text-profit">
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accentDeep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending reset link..." : "Send Reset Link"}
      </button>

      <p className="text-sm text-slate-600">
        Remember your password?{" "}
        <Link href="/login" className="font-medium text-accent hover:text-accentDeep">
          Back to login
        </Link>
      </p>
    </form>
  );
}
