import { requireAdmin } from "@/lib/auth";
import { getAllTraders } from "@/lib/queries";
import { AdminTraderTable } from "@/components/admin-trader-table";
import { AddTraderForm } from "@/components/add-trader-form";

export default async function AdminPage() {
  await requireAdmin();
  const traders = await getAllTraders();

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-white p-7 shadow-sm">
        <p className="text-sm uppercase tracking-wider text-accent">Admin Desk</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-ink">
          Manage Traders
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Approve, reject, promote to Super Trader, or remove trader accounts.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">Traders</p>
          <AddTraderForm />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <AdminTraderTable traders={traders} />
      </section>
    </div>
  );
}
