import Link from "next/link";
import { logout } from "@/app/actions/auth";
import PortalHeader from "@/components/portal/PortalHeader";
import { config } from "@/lib/server/config";
import { requireUser } from "@/lib/server/session";

// Every page in this group also checks its own role; this layout only
// supplies the header (layouts don't re-run on every client navigation).
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <>
      {config.demoMode ? (
        <div className="bg-amber-400 px-6 py-1.5 text-center text-xs font-medium text-amber-950">
          Demo environment — sample data that resets from time to time. Don&apos;t upload real documents (4 MB limit per file here).{" "}
          <form action={logout} className="inline">
            <button type="submit" className="underline">
              Switch role
            </button>
          </form>{" "}
          · <Link href="/calculator" className="underline">Electrical calculator</Link>
        </div>
      ) : null}
      <PortalHeader user={user} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">{children}</main>
    </>
  );
}
