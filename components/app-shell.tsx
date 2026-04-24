import Link from "next/link";
import { BarChart3, Flag, LayoutDashboard, Medal, PencilLine, Shield } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

const traderNavigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Journal", icon: BarChart3 },
  { href: "/trades/new", label: "New Trade", icon: PencilLine },
  { href: "/leaderboard", label: "Leaderboard", icon: Medal },
];

const superTraderNavigation = [
  ...traderNavigation,
  { href: "/competitions", label: "Competitions", icon: Flag },
];

const adminNavigation = [
  ...traderNavigation,
  { href: "/competitions", label: "Competitions", icon: Flag },
  { href: "/admin", label: "Admin", icon: Shield },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const navigation =
    user?.role === "ADMIN"
      ? adminNavigation
      : user?.role === "SUPER_TRADER"
        ? superTraderNavigation
        : traderNavigation;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(180,134,13,0.16),_transparent_70%)] blur-3xl" />
        <div className="absolute right-0 top-16 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,_rgba(161,118,14,0.13),_transparent_72%)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <header className="animate-reveal rounded-[28px] border border-[#e2d6b1] bg-white/90 px-5 py-4 shadow-soft backdrop-blur xl:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link href={user ? "/dashboard" : "/login"} className="inline-flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#a7770e] text-sm font-semibold text-white shadow-lg shadow-amber-700/20">
                  SS
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-ink">
                    StockScript Journal
                  </p>
                  <p className="text-sm text-slate-600">
                    Trader journals, approvals, competitions, and fair percentage returns.
                  </p>
                </div>
              </Link>
            </div>

            <div className="flex flex-col gap-4 lg:items-end">
              {user ? (
                <>
                  <nav className="flex flex-wrap gap-2">
                    {navigation.map((item) => {
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="inline-flex items-center gap-2 rounded-full border border-[#eadfbe] bg-[#fffdfa] px-4 py-2 text-sm font-medium text-[#5f4b1f] transition hover:-translate-y-0.5 hover:border-[#c59e32] hover:text-[#8d6500]"
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span className="rounded-full border border-[#eadfbe] bg-[#fff7dc] px-3 py-1 font-medium text-[#7b5a00]">
                      {user.role}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {user.name}
                    </span>
                    <Link
                      href="/logout"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 transition hover:border-[#c59e32] hover:text-[#8d6500]"
                    >
                      Logout
                    </Link>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/login"
                    className="rounded-full border border-[#eadfbe] bg-[#fffdfa] px-4 py-2 text-sm font-medium text-[#5f4b1f]"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full bg-[#a7770e] px-4 py-2 text-sm font-medium text-white"
                  >
                    Create trader account
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mt-8 flex-1">{children}</main>
      </div>
    </div>
  );
}
