import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PropertyDetail from "@/components/portal/PropertyDetail";
import { Card } from "@/components/portal/ui";
import { formatDateTime } from "@/lib/expansion/format";
import { propertyAudit } from "@/lib/server/audit";
import { getProperty } from "@/lib/server/properties";
import { requireRole } from "@/lib/server/session";

export const metadata: Metadata = { title: "Property" };

const ACTION_LABEL: Record<string, string> = {
  "property.created": "Created draft",
  "property.updated": "Edited details",
  "property.submitted": "Submitted for review",
  "property.resubmitted": "Resubmitted for a new round",
  "media.added": "Added media",
  "media.removed": "Removed media",
  "decision.sales.approved": "Sales & Category approved",
  "decision.sales.passed": "Sales & Category passed",
  "decision.ops.approved": "Ops approved",
  "decision.ops.passed": "Ops passed",
  "decision.business.approved": "Business Leaders approved",
  "decision.business.passed": "Business Leaders passed",
};

export default async function AdminProperty(props: PageProps<"/admin/properties/[id]">) {
  const user = await requireRole("admin");
  const { id } = await props.params;
  const property = getProperty(user, Number(id));
  if (!property) notFound();
  const history = propertyAudit(property.id);

  return (
    <PropertyDetail property={property} role={user.role}>
      <Card title="Activity">
        <ol className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-2">
              <time className="w-44 shrink-0 text-zinc-500">{formatDateTime(h.createdAt)}</time>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{h.actorName ?? "System"}</span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {ACTION_LABEL[h.action] ?? h.action}
                {h.details ? ` — ${h.details}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </PropertyDetail>
  );
}
