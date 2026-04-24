import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function PendingApprovalPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-3xl rounded-[36px] border border-[#e2d6b1] bg-white/95 p-8 shadow-soft">
      <p className="text-sm uppercase tracking-[0.24em] text-[#9d7a1f]">Approval Status</p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-ink">
        Trader account pending admin validation
      </h1>
      <p className="mt-4 text-base leading-8 text-slate-700">
        {user.emailVerifiedAt
          ? `${user.name}, your email is verified. The admin account now needs to validate your trader profile before you can post or enter trades.`
          : `${user.name}, verify your email first. The admin approval step comes immediately after email verification.`}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!user.emailVerifiedAt ? (
          <Link
            href="/verify-email"
            className="rounded-full bg-[#a7770e] px-5 py-3 text-sm font-medium text-white"
          >
            Go to email verification
          </Link>
        ) : null}
        <Link
          href="/logout"
          className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700"
        >
          Logout
        </Link>
      </div>
    </div>
  );
}
