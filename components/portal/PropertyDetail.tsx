import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/expansion/format";
import type { Role } from "@/lib/expansion/roles";
import type { PropertyView } from "@/lib/expansion/types";
import { reviewerStage, STAGE_LABEL, visibleDecisionStages } from "@/lib/expansion/workflow";
import MapEmbed from "./MapEmbed";
import MediaGallery from "./MediaGallery";
import PropertyFacts from "./PropertyFacts";
import StageTracker, { PastRounds } from "./StageTracker";
import { Card, PageHeader, StatusBadge } from "./ui";

/** A property as the given role may see it: approvals, facts, map and media. */
export default function PropertyDetail({
  property,
  role,
  actions,
  aside,
  children,
}: {
  property: PropertyView;
  role: Role;
  actions?: ReactNode;
  /** Shown above the details, e.g. the decision form. */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const stage = reviewerStage(role);
  return (
    <>
      <PageHeader
        title={property.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{property.code}</span>
            {stage ? null : <StatusBadge status={property.status} />}
            {property.round > 1 ? <span>· review round {property.round}</span> : null}
            <span>
              · Uploaded by {property.createdByName}
              {property.submittedAt ? `, submitted ${formatDateTime(property.submittedAt)}` : ""}
            </span>
          </span>
        }
        actions={actions}
      />

      {aside}

      {property.status !== "draft" ? (
        <Card title="Approvals">
          <StageTracker property={property} visibleStages={visibleDecisionStages(role)} />
          <PastRounds property={property} />
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={stage ? `Details shared with ${STAGE_LABEL[stage]}` : "Property details"}>
          <PropertyFacts property={property} role={role} />
        </Card>
        <Card title="Location">
          <MapEmbed property={property} />
        </Card>
      </div>

      {property.mediaVisible ? (
        <Card title={`Photos & videos (${property.media.length})`}>
          <MediaGallery media={property.media} />
        </Card>
      ) : null}

      {children}
    </>
  );
}
