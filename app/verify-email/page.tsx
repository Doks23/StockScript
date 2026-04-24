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
    <div className="mx-auto max-w-3xl rounded-[36px] border border-[#e2d6b1] bg-white/95 p-8 shadow-soft">
      <p className="text-sm uppercase tracking-[0.24em] text-[#9d7a1f]">Email Verification</p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-ink">
        {verifiedUser ? "Email verified successfully" : "Verify your email ID"}
      </h1>
      <p className="mt-4 text-base leading-8 text-slate-700">
        {verifiedUser
          ? `${verifiedUser.name}, your email is now verified. The admin must still approve your trader account before trade posting is enabled.`
          : "Open the verification link generated during registration. Once verified, the account moves to admin approval."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={verifiedUser ? "/pending-approval" : "/register"}
          className="rounded-full bg-[#a7770e] px-5 py-3 text-sm font-medium text-white"
        >
          {verifiedUser ? "Continue" : "Back to registration"}
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700"
        >
          Login
        </Link>
      </div>
    </div>
  );
}
