import type { Metadata } from "next";
import Link from "next/link";
import PropertyTable from "@/components/portal/PropertyTable";
import { buttonClass, PageHeader } from "@/components/portal/ui";
import { listProperties } from "@/lib/server/properties";
import { requireRole } from "@/lib/server/session";

export const metadata: Metadata = { title: "My properties" };

export default async function RealEstateHome() {
  const user = await requireRole("real_estate");
  const properties = listProperties(user);
  const count = (pred: (s: string) => boolean) => properties.filter((p) => pred(p.status)).length;

  return (
    <>
      <PageHeader
        title="My properties"
        subtitle={`${count((s) => s.startsWith("pending_"))} in review · ${count((s) => s === "approved")} approved · ${count((s) => s.startsWith("passed_"))} passed · ${count((s) => s === "draft")} drafts`}
        actions={
          <Link href="/real-estate/new" className={buttonClass.primary}>
            + Upload property
          </Link>
        }
      />
      <PropertyTable
        properties={properties}
        role={user.role}
        hrefBase="/real-estate/properties"
        empty="You haven't uploaded any properties yet."
      />
    </>
  );
}
