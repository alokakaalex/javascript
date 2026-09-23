import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { removeMedia } from "@/app/actions/properties";
import MediaUploader from "@/components/portal/MediaUploader";
import PropertyForm from "@/components/portal/PropertyForm";
import SubmitPanel from "@/components/portal/SubmitPanel";
import { Alert, buttonClass, Card, PageHeader, StatusBadge } from "@/components/portal/ui";
import { formatBytes } from "@/lib/expansion/format";
import { isEditable } from "@/lib/expansion/workflow";
import { getProperty } from "@/lib/server/properties";
import { requireRole } from "@/lib/server/session";

export const metadata: Metadata = { title: "Edit property" };

export default async function EditProperty(props: PageProps<"/real-estate/properties/[id]/edit">) {
  const user = await requireRole("real_estate");
  const { id } = await props.params;
  const { created } = await props.searchParams;
  const property = getProperty(user, Number(id));
  if (!property) notFound();
  if (!isEditable(property.status)) redirect(`/real-estate/properties/${property.id}`);

  return (
    <>
      <PageHeader
        title={property.title}
        subtitle={
          <span className="flex items-center gap-2">
            {property.code} <StatusBadge status={property.status} />
          </span>
        }
        actions={
          <Link href={`/real-estate/properties/${property.id}`} className={buttonClass.secondary}>
            View property
          </Link>
        }
      />
      {created ? <Alert tone="success">Details saved as a draft. Now add photos and videos, then submit.</Alert> : null}

      <Card title={`Photos & videos (${property.media.length})`}>
        <div className="space-y-4">
          {property.media.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {property.media.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${m.id}`} alt={m.originalName} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <video src={`/api/media/${m.id}`} preload="metadata" muted className="aspect-[4/3] w-full bg-black object-cover" />
                  )}
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                    <span className="truncate text-zinc-600 dark:text-zinc-400" title={m.originalName}>
                      {m.kind === "video" ? "▶ " : ""}
                      {formatBytes(m.sizeBytes)}
                    </span>
                    <form action={removeMedia}>
                      <input type="hidden" name="mediaId" value={m.id} />
                      <input type="hidden" name="propertyId" value={property.id} />
                      <button type="submit" className="text-rose-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <MediaUploader propertyId={property.id} />
        </div>
      </Card>

      <Card title="Submit for review">
        <p className="mb-3 text-sm text-zinc-500">
          Sales &amp; Category reviews first, then Ops, then Business Leaders. While it&apos;s in review the property
          is locked; if any team passes it you can revise and resubmit.
        </p>
        <SubmitPanel
          propertyId={property.id}
          resubmission={property.round > 0}
          canDelete={property.status === "draft"}
          mediaCount={property.media.length}
        />
      </Card>

      <Card title="Property details">
        <PropertyForm property={property} />
      </Card>
    </>
  );
}
