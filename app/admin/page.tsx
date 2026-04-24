import { requireAdmin } from "@/lib/auth";
import { getAllTraders } from "@/lib/queries";
import { AdminTraderTable } from "@/components/admin-trader-table";

export default async function AdminPage() {
  await requireAdmin();
  const traders = await getAllTraders();

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-[#e2d6b1] bg-white/95 p-7 shadow-soft">
        <p className="text-sm uppercase tracking-[0.24em] text-[#9d7a1f]">Admin Desk</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-ink">
          Manage Traders
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Approve, reject, promote to Super Trader, or remove trader accounts.
        </p>
      </section>

      <section className="overflow-hidden rounded-[32px] border border-[#e2d6b1] bg-white/95 shadow-soft">
        <AdminTraderTable traders={traders} />
      </section>
    </div>
  );
}
