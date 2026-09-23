// The property approval pipeline and the per-role visibility rules. This
// file is pure (no I/O) so the rules can be unit tested and shared by the
// server data layer and the UI.

import type { Role } from "./roles";

// Review stages, in the order a property moves through them.
export const STAGES = ["sales", "ops", "business"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  sales: "Sales & Category",
  ops: "Ops",
  business: "Business Leaders",
};

export type Decision = "approved" | "passed";

export const DECISION_LABEL: Record<Decision, string> = {
  approved: "Approved",
  passed: "Passed",
};

export type PropertyStatus =
  | "draft"
  | "pending_sales"
  | "pending_ops"
  | "pending_business"
  | "approved"
  | "passed_sales"
  | "passed_ops"
  | "passed_business";

export const STATUS_LABEL: Record<PropertyStatus, string> = {
  draft: "Draft",
  pending_sales: "Awaiting Sales",
  pending_ops: "Awaiting Ops",
  pending_business: "Awaiting Business",
  approved: "Approved",
  passed_sales: "Passed by Sales",
  passed_ops: "Passed by Ops",
  passed_business: "Passed by Business",
};

export function pendingStatus(stage: Stage): PropertyStatus {
  return `pending_${stage}` as PropertyStatus;
}

/** The stage currently holding the property, or null if none is. */
export function pendingStage(status: PropertyStatus): Stage | null {
  if (status.startsWith("pending_")) return status.slice("pending_".length) as Stage;
  return null;
}

/**
 * The status a property moves to after `stage` records `decision`: an
 * approval hands it to the next stage (or finishes the pipeline), a pass
 * stops it.
 */
export function nextStatus(stage: Stage, decision: Decision): PropertyStatus {
  if (decision === "passed") return `passed_${stage}` as PropertyStatus;
  const next = STAGES[STAGES.indexOf(stage) + 1];
  return next ? pendingStatus(next) : "approved";
}

/** Only the uploader can change a property, and only before it enters review or after it was passed. */
export function isEditable(status: PropertyStatus): boolean {
  return status === "draft" || status.startsWith("passed_");
}

export function isFinal(status: PropertyStatus): boolean {
  return status === "approved" || status.startsWith("passed_");
}

export function reviewerStage(role: Role): Stage | null {
  return (STAGES as readonly string[]).includes(role) ? (role as Stage) : null;
}

// --- Field visibility -------------------------------------------------------

export const PROPERTY_FIELDS = [
  "title",
  "address",
  "mapUrl",
  "latitude",
  "longitude",
  "ownerName",
  "areaSqft",
  "rentPerMonth",
  "securityDeposit",
  "advanceRent",
  "leaseTenureMonths",
  "rentEscalationPct",
  "rentFreeDays",
  "handoverDate",
  "lockInMonths",
  "notes",
] as const;
export type PropertyField = (typeof PROPERTY_FIELDS)[number];

// Every reviewer sees the title and location so they know which property
// they are looking at; beyond that each team sees only what it was asked to
// assess.
const LOCATION: PropertyField[] = ["title", "address", "mapUrl", "latitude", "longitude"];

export interface StageVisibility {
  fields: ReadonlySet<PropertyField>;
  media: boolean;
}

export const STAGE_VISIBILITY: Record<Stage, StageVisibility> = {
  sales: {
    fields: new Set<PropertyField>([...LOCATION, "areaSqft"]),
    media: true,
  },
  ops: {
    fields: new Set<PropertyField>([
      ...LOCATION,
      "areaSqft",
      "advanceRent",
      "securityDeposit",
      "rentFreeDays",
    ]),
    media: false,
  },
  business: {
    fields: new Set<PropertyField>([
      ...LOCATION,
      "areaSqft",
      "rentPerMonth",
      "securityDeposit",
      "advanceRent",
      "rentFreeDays",
    ]),
    media: true,
  },
};

const FULL: StageVisibility = { fields: new Set(PROPERTY_FIELDS), media: true };

/** What a role may see of a property it has access to. */
export function visibilityFor(role: Role): StageVisibility {
  const stage = reviewerStage(role);
  return stage ? STAGE_VISIBILITY[stage] : FULL;
}

/**
 * Which earlier decisions a reviewer sees: its own stage's and every stage
 * before it (ops sees that sales approved; business sees sales and ops).
 * Later stages' decisions are hidden so they don't bias an earlier review
 * on a resubmitted property.
 */
export function visibleDecisionStages(role: Role): readonly Stage[] {
  const stage = reviewerStage(role);
  if (!stage) return STAGES;
  return STAGES.slice(0, STAGES.indexOf(stage) + 1);
}
