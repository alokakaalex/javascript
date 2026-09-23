import PortalHeader from "@/components/portal/PortalHeader";
import { requireUser } from "@/lib/server/session";

// Every page in this group also checks its own role; this layout only
// supplies the header (layouts don't re-run on every client navigation).
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <>
      <PortalHeader user={user} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">{children}</main>
    </>
  );
}
