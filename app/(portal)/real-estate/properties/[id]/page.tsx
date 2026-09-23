import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PropertyDetail from "@/components/portal/PropertyDetail";
import { Alert, buttonClass } from "@/components/portal/ui";
import { isEditable } from "@/lib/expansion/workflow";
import { getProperty } from "@/lib/server/properties";
import { requireRole } from "@/lib/server/session";

export const metadata: Metadata = { title: "Property" };

export default async function RealEstateProperty(props: PageProps<"/real-estate/properties/[id]">) {
  const user = await requireRole("real_estate");
  const { id } = await props.params;
  const { submitted } = await props.searchParams;
  const property = getProperty(user, Number(id));
  if (!property) notFound();

  const editable = isEditable(property.status);
  return (
    <PropertyDetail
      property={property}
      role={user.role}
      actions={
        editable ? (
          <Link href={`/real-estate/properties/${property.id}/edit`} className={buttonClass.primary}>
            {property.status === "draft" ? "Continue editing" : "Revise & resubmit"}
          </Link>
        ) : null
      }
      aside={
        submitted ? (
          <Alert tone="success">Submitted. Sales &amp; Category has been notified, and you&apos;ll be notified of each team&apos;s decision.</Alert>
        ) : property.status.startsWith("passed_") ? (
          <Alert tone="warning">This property was passed. You can revise the details and resubmit it for a new review round.</Alert>
        ) : null
      }
    />
  );
}
