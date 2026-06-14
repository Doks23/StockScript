"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Calculator,
  Flag,
  LayoutDashboard,
  LineChart,
  Medal,
  MoreHorizontal,
  PencilLine,
  Plus,
  Shield,
  User as UserIcon,
  X,
} from "lucide-react";

export type NavSpec = {
  href: string;
  label: string;
  iconKey: IconKey;
};

type IconKey =
  | "dashboard"
  | "journal"
  | "summary"
  | "newTrade"
  | "positionSizer"
  | "leaderboard"
  | "account"
  | "competitions"
  | "admin";

const ICONS: Record<IconKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  journal: BarChart3,
  summary: LineChart,
  newTrade: PencilLine,
  positionSizer: Calculator,
  leaderboard: Medal,
  account: UserIcon,
  competitions: Flag,
  admin: Shield,
};

type MobileNavProps = {
  items: NavSpec[];
  user: { name: string; role: string };
};

const PRIMARY_HREFS = ["/dashboard", "/trades", "/leaderboard"];
const FAB_HREF = "/trades/new";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/trades")
    return (
      pathname === "/trades" ||
      (pathname.startsWith("/trades/") && pathname !== "/trades/new")
    );
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({ items, user }: MobileNavProps) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const primary = PRIMARY_HREFS.map((href) =>
    items.find((i) => i.href === href),
  ).filter(Boolean) as NavSpec[];

  const fab = items.find((i) => i.href === FAB_HREF);
  const account = items.find((i) => i.href === "/account") ?? {
    href: "/account",
    label: "Account",
    iconKey: "account" as const,
  };
  const overflow = items.filter(
    (i) =>
      !PRIMARY_HREFS.includes(i.href) &&
      i.href !== FAB_HREF &&
      i.href !== "/account",
  );

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
      setSheetOpen(false);
    }
  }

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[1500px] items-stretch justify-between px-2">
          {primary.slice(0, 2).map((item) => (
            <TabLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}

          {fab && (
            <Link
              href={fab.href}
              aria-label={fab.label}
              className="relative -mt-5 flex h-14 w-14 shrink-0 items-center justify-center self-center rounded-full bg-gradient-to-br from-accent to-accentDeep text-white shadow-lg shadow-accent/30 transition active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </Link>
          )}

          {primary.slice(2, 3).map((item) => (
            <TabLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-500 active:text-accent"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      {sheetOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-5 shadow-2xl lg:hidden"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold uppercase text-accent">
                  {user.name?.charAt(0) || "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {user.name}
                  </p>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    {user.role}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="grid grid-cols-2 gap-2">
              {overflow.map((item) => {
                const Icon = ICONS[item.iconKey];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      isActive(pathname, item.href)
                        ? "border-accent/30 bg-accent/5 text-accent"
                        : "border-line bg-canvas text-slate-700"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href={account.href}
                onClick={() => setSheetOpen(false)}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                  isActive(pathname, account.href)
                    ? "border-accent/30 bg-accent/5 text-accent"
                    : "border-line bg-canvas text-slate-700"
                }`}
              >
                <UserIcon className="h-4 w-4" />
                {account.label}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-2xl border border-loss/30 bg-loss/5 px-4 py-3 text-sm font-medium text-loss transition active:bg-loss/10 disabled:opacity-60"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TabLink({ item, active }: { item: NavSpec; active: boolean }) {
  const Icon = ICONS[item.iconKey];
  return (
    <Link
      href={item.href}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition ${
        active ? "text-accent" : "text-slate-500 active:text-accent"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">{item.label}</span>
    </Link>
  );
}
