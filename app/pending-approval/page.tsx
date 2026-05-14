import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function PendingApprovalPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-8 shadow-sm">
      <p className="text-sm uppercase tracking-wider text-accent">Approval Status</p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-ink">
        Trader account pending admin validation
      </h1>
      <p className="mt-4 text-base leading-8 text-slate-600">
        {user.emailVerifiedAt
          ? `${user.name}, your email is verified. The admin account now needs to validate your trader profile before you can post or enter trades.`
          : `${user.name}, verify your email first. The admin approval step comes immediately after email verification.`}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!user.emailVerifiedAt ? (
          <Link
            href="/verify-email"
            className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accentDeep"
          >
            Go to email verification
          </Link>
        ) : null}
        <Link
          href="/logout"
          className="rounded-xl border border-line bg-white px-5 py-3 text-sm font-medium text-slate-600 hover:bg-canvas"
        >
          Logout
        </Link>
      </div>
    </div>
  );
}
