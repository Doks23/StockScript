import Link from "next/link";
import { verifyEmailToken } from "@/lib/auth";

type VerifyEmailPageProps = {
  searchParams: {
    token?: string;
  };
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const token = searchParams.token;
  const verifiedUser = token ? await verifyEmailToken(token) : null;

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-8 shadow-sm">
      <p className="text-sm uppercase tracking-wider text-accent">Email Verification</p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-ink">
        {verifiedUser ? "Email verified successfully" : "Verify your email ID"}
      </h1>
      <p className="mt-4 text-base leading-8 text-slate-600">
        {verifiedUser
          ? `${verifiedUser.name}, your email is now verified. The admin must still approve your trader account before trade posting is enabled.`
          : "Open the verification link generated during registration. Once verified, the account moves to admin approval."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={verifiedUser ? "/pending-approval" : "/register"}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accentDeep"
        >
          {verifiedUser ? "Continue" : "Back to registration"}
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-line bg-white px-5 py-3 text-sm font-medium text-slate-600 hover:bg-canvas"
        >
          Login
        </Link>
      </div>
    </div>
  );
}
