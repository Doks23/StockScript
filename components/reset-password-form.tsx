"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ResetPasswordFormProps {
  token: string | null;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");

    if (!token) {
      setError("Invalid or missing reset token.");
      return;
    }

    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        password,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to reset password.");
      setIsSubmitting(false);
      return;
    }

    router.push("/login?message=Password reset successfully. Please log in with your new password.");
    router.refresh();
  }

  if (!token) {
    return (
      <div className="space-y-5 rounded-[32px] border border-line bg-panel p-8 shadow-soft">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-accent">Password Reset</p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Invalid reset link</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            The password reset link is missing or invalid. Please request a new one.
          </p>
        </div>

        <p className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          Invalid or expired reset token.
        </p>

        <Link
          href="/forgot-password"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accentDeep"
        >
          Request New Reset Link
        </Link>
      </div>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-5 rounded-[32px] border border-line bg-panel p-8 shadow-soft"
    >
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-accent">Password Reset</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Set new password</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Enter a new password for your trading account. It must be at least 8 characters long.
        </p>
      </div>

      <label className="form-field">
        New Password
        <input name="password" type="password" required minLength={8} className="form-input" />
      </label>

      <label className="form-field">
        Confirm Password
        <input name="confirmPassword" type="password" required minLength={8} className="form-input" />
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
        {isSubmitting ? "Resetting password..." : "Reset Password"}
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
