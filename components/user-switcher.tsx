"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type User = {
  id: string;
  name: string;
};

export function UserSwitcher({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex min-w-[220px] flex-col gap-2 text-sm text-slate-600">
      Trader Context
      <select
        value={currentUserId}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("userId", event.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-accent"
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </label>
  );
}
