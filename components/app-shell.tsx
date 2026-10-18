import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Calculator,
  Flag,
  LayoutDashboard,
  LineChart,
  Target,
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
  children?: NavItem[];
};

const leaderboardItem: NavItem = {
  href: "/leaderboard",
  label: "Leaderboard",
  iconKey: "leaderboard",
  icon: Medal,
};

const tradingNavigation: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", iconKey: "dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Journal", iconKey: "journal", icon: BarChart3 },
  { href: "/summary", label: "Summary", iconKey: "summary", icon: LineChart },
  { href: "/r-multiple", label: "R-Multiples", iconKey: "rMultiple", icon: Target },
  { href: "/trades/new", label: "New Trade", iconKey: "newTrade", icon: PencilLine },
  { href: "/position-size", label: "Position Sizer", iconKey: "positionSizer", icon: Calculator },
];

// A leaderboard is always a view of one competition, so it sits nested under
// Competitions for the roles that can open that section. Plain traders are
// redirected away from /competitions, so for them it stays a top-level link
// rather than hiding behind a parent they cannot reach.
const competitionsItem: NavItem = {
  href: "/competitions",
  label: "Competitions",
  iconKey: "competitions",
  icon: Flag,
  children: [leaderboardItem],
};

const traderNavigation: NavItem[] = [...tradingNavigation, leaderboardItem];

const superTraderNavigation: NavItem[] = [...tradingNavigation, competitionsItem];

const adminNavigation: NavItem[] = [
  ...tradingNavigation,
  competitionsItem,
  { href: "/admin", label: "Admin", iconKey: "admin", icon: Shield },
];

/** The mobile bar is a flat tab strip, so nested entries are hoisted back out for it. */
function flattenNavigation(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ?? [])]);
}

function NavLink({ item, variant }: { item: NavItem; variant: "solo" | "parent" | "child" }) {
  const Icon = item.icon;
  const shared = "inline-flex items-center gap-2 font-medium transition hover:text-accent";
  const byVariant = {
    solo: "rounded-full border border-line bg-white px-4 py-2 text-sm text-slate-600 hover:-translate-y-0.5 hover:border-accent",
    parent: "rounded-l-full px-4 py-2 text-sm text-slate-600",
    child: "rounded-r-full py-2 pl-3 pr-4 text-[13px] text-slate-500",
  }[variant];

  return (
    <Link href={item.href} className={`${shared} ${byVariant}`}>
      <Icon className={variant === "child" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {item.label}
    </Link>
  );
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const navigation: NavItem[] =
    user?.role === "ADMIN"
      ? adminNavigation
      : user?.role === "SUPER_TRADER"
        ? superTraderNavigation
        : traderNavigation;

  return (
    <div className="relative min-h-screen overflow-clip bg-canvas">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1720px] flex-col px-4 pb-24 pt-3 sm:px-8 sm:pb-10 sm:pt-4 lg:px-12">
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
                  <nav className="flex flex-wrap items-center gap-2">
                    {navigation.map((item) =>
                      item.children?.length ? (
                        <div
                          key={item.href}
                          className="inline-flex items-center rounded-full border border-line bg-white transition hover:border-accent"
                        >
                          <NavLink item={item} variant="parent" />
                          {item.children.map((child) => (
                            <div key={child.href} className="inline-flex items-center">
                              <span className="h-4 w-px shrink-0 bg-line" />
                              <NavLink item={child} variant="child" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <NavLink key={item.href} item={item} variant="solo" />
                      ),
                    )}
                  </nav>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
                      {user.role}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {user.name}
                    </span>
                    <Link
                      href="/account"
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 font-medium text-slate-600 transition hover:border-accent hover:text-accent"
                    >
                      <User className="h-4 w-4" />
                      Account
                    </Link>
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
          items={flattenNavigation(navigation).map(({ href, label, iconKey }) => ({
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
