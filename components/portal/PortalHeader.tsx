import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { ROLE_INFO } from "@/lib/expansion/roles";
import type { User } from "@/lib/expansion/types";
import { unreadCount } from "@/lib/server/notifications";
import { pendingCount } from "@/lib/server/properties";

function navFor(user: User): { href: string; label: string; badge?: number }[] {
  switch (user.role) {
    case "admin":
      return [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/users", label: "Access & roles" },
        { href: "/calculator", label: "Electrical calculator" },
      ];
    case "real_estate":
      return [
        { href: "/real-estate", label: "My properties" },
        { href: "/real-estate/new", label: "Upload property" },
        { href: "/calculator", label: "Electrical calculator" },
      ];
    default:
      return [{ href: ROLE_INFO[user.role].portal, label: "Review queue", badge: pendingCount(user) }];
  }
}

export default function PortalHeader({ user }: { user: User }) {
  const unread = unreadCount(user.id);
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href={ROLE_INFO[user.role].portal} className="flex items-center gap-2">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Expansion Portal</span>
          <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            {ROLE_INFO[user.role].label}
          </span>
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-4 text-sm">
          {navFor(user).map((item) => (
            <Link key={item.href} href={item.href} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              {item.label}
              {item.badge ? (
                <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-semibold text-amber-950">{item.badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/notifications" className="relative text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100" aria-label={`Notifications (${unread} unread)`}>
            <span aria-hidden>🔔</span> Notifications
            {unread > 0 ? (
              <span className="ml-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-semibold text-white">{unread}</span>
            ) : null}
          </Link>
          <Link href="/account" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100" title={user.email}>
            {user.name}
          </Link>
          <form action={logout}>
            <button type="submit" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
