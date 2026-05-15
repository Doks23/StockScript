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
          ? `${verifiedUser.name}, your email is now verified. You can log in to your account.`
          : "Open the verification link generated during registration. Once verified, you can log in to your account."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={verifiedUser ? "/login" : "/register"}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accentDeep"
        >
          {verifiedUser ? "Login to your account" : "Back to registration"}
        </Link>
      </div>
    </div>
  );
}
