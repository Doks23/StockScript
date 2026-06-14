import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Flag,
  LayoutDashboard,
  LineChart,
  Medal,
  PencilLine,
  Shield,
  User,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { MobileNav, type NavSpec } from "./mobile-nav";

type NavItem = NavSpec & {
  icon: React.ComponentType<{ className?: string }>;
};

const traderNavigation: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", iconKey: "dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Journal", iconKey: "journal", icon: BarChart3 },
  { href: "/summary", label: "Summary", iconKey: "summary", icon: LineChart },
  { href: "/trades/new", label: "New Trade", iconKey: "newTrade", icon: PencilLine },
  { href: "/leaderboard", label: "Leaderboard", iconKey: "leaderboard", icon: Medal },
  { href: "/account", label: "Account", iconKey: "account", icon: User },
];

const superTraderNavigation: NavItem[] = [
  ...traderNavigation,
  { href: "/competitions", label: "Competitions", iconKey: "competitions", icon: Flag },
];

const adminNavigation: NavItem[] = [
  ...traderNavigation,
  { href: "/competitions", label: "Competitions", iconKey: "competitions", icon: Flag },
  { href: "/admin", label: "Admin", iconKey: "admin", icon: Shield },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const navigation: NavItem[] =
    user?.role === "ADMIN"
      ? adminNavigation
      : user?.role === "SUPER_TRADER"
        ? superTraderNavigation
        : traderNavigation;

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-3 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 lg:px-8">
        <header className="animate-reveal rounded-2xl border border-line bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur sm:px-5 sm:py-4 xl:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between">
              <Link
                href={user ? "/dashboard" : "/login"}
                className="inline-flex items-center gap-3"
              >
                <Image
                  src="/stockscript-logo-horizontal.svg"
                  alt="StockScript"
                  width={420}
                  height={80}
                  className="h-9 w-auto sm:h-14"
                  unoptimized
                />
              </Link>
              {user && (
                <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-accent lg:hidden">
                  {user.role}
                </span>
              )}
            </div>

            <div className="hidden flex-col gap-4 lg:flex lg:items-end">
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

        <main className="mt-4 flex-1 sm:mt-8">{children}</main>
      </div>

      {user && (
        <MobileNav
          items={navigation.map(({ href, label, iconKey }) => ({
            href,
            label,
            iconKey,
          }))}
          user={{ name: user.name, role: user.role }}
        />
      )}
    </div>
  );
}
