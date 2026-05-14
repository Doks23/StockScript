import Link from "next/link";
import {
  BarChart3,
  Flag,
  LayoutDashboard,
  Medal,
  PencilLine,
  Shield,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

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
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <header className="animate-reveal rounded-2xl border border-line bg-white/80 px-5 py-4 shadow-sm backdrop-blur xl:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                href={user ? "/dashboard" : "/login"}
                className="inline-flex items-center gap-3"
              >
                <img
                  src="/stockscript-logo-horizontal.svg"
                  alt="StockScript"
                  className="h-14"
                />
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
                          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:-translate-y-0.5 hover:border-accent hover:text-accent"
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
                      {user.role}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {user.name}
                    </span>
                    <LogoutButton />
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/login"
                    className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:text-accent"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDeep"
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
