"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to log in.");
      setIsSubmitting(false);
      return;
    }

    router.push(result.redirectTo || "/dashboard");
    router.refresh();
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-5 rounded-[32px] border border-line bg-panel p-8 shadow-soft"
    >
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-accent">Login</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Trader access</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Sign in with your trader ID email and password. Verified and approved traders can enter trades immediately.
        </p>
      </div>

      <label className="form-field">
        Email ID
        <input name="email" type="email" required className="form-input" />
      </label>

      <label className="form-field">
        Password
        <input name="password" type="password" required className="form-input" />
      </label>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs font-medium text-accent hover:text-accentDeep">
          Forgot password?
        </Link>
      </div>

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
        {isSubmitting ? "Signing in..." : "Login"}
      </button>

      <p className="text-sm text-slate-600">
        New trader?{" "}
        <Link href="/register" className="font-medium text-accent hover:text-accentDeep">
          Create an account
        </Link>
      </p>
    </form>
  );
}
