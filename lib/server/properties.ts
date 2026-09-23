import "server-only";
import { formatNumber, propertyCode } from "@/lib/expansion/format";
import type { PropertyInput } from "@/lib/expansion/propertyInput";
import { ROLE_INFO } from "@/lib/expansion/roles";
import type { DecisionRecord, MediaItem, PropertyDetails, PropertyView, User } from "@/lib/expansion/types";
import {
  DECISION_LABEL,
  isEditable,
  nextStatus,
  pendingStage,
  pendingStatus,
  PROPERTY_FIELDS,
  reviewerStage,
  STAGE_LABEL,
  STAGES,
  visibilityFor,
  visibleDecisionStages,
  type Decision,
  type PropertyStatus,
  type Stage,
} from "@/lib/expansion/workflow";
import { audit } from "./audit";
import { db, now, tx } from "./db";
import { notifyRole, notifyUser } from "./notifications";

export class PropertyError extends Error {}

interface PropertyRow {
  id: number;
  status: PropertyStatus;
  round: number;
  title: string;
  address: string;
  map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  owner_name: string;
  area_sqft: number;
  rent_per_month: number;
  security_deposit: number;
  advance_rent: number;
  lease_tenure_months: number;
  rent_escalation_pct: number;
  rent_free_days: number;
  handover_date: string;
  lock_in_months: number;
  notes: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

interface MediaRow {
  id: string;
  property_id: number;
  kind: "image" | "video";
  mime: string;
  original_name: string;
  size_bytes: number;
  created_at: string;
}

interface DecisionRow {
  property_id: number;
  round: number;
  stage: Stage;
  decision: Decision;
  remarks: string;
  decided_by: string;
  decided_by_name: string;
  decided_at: string;
}

const SELECT_PROPERTY = `
  SELECT p.*, u.name AS created_by_name
  FROM properties p JOIN users u ON u.id = p.created_by`;

// --- Access -----------------------------------------------------------------

/**
 * SQL condition (on alias p) for the properties a user may open at all:
 * admins see everything, real estate managers their own uploads, and each
 * review team only properties that have reached it.
 */
function accessCondition(viewer: User): { sql: string; params: (string | number)[] } {
  switch (viewer.role) {
    case "admin":
      return { sql: "1 = 1", params: [] };
    case "real_estate":
      return { sql: "p.created_by = ?", params: [viewer.id] };
    case "sales":
      return { sql: "p.round > 0", params: [] };
    case "ops":
    case "business": {
      // Reached this stage at least once: the previous stage approved it in some round.
      const previous = STAGES[STAGES.indexOf(viewer.role) - 1];
      return {
        sql: `EXISTS (SELECT 1 FROM decisions d WHERE d.property_id = p.id AND d.stage = ? AND d.decision = 'approved')`,
        params: [previous],
      };
    }
  }
}

function toMedia(row: MediaRow): MediaItem {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

function toDecision(row: DecisionRow): DecisionRecord {
  return {
    round: row.round,
    stage: row.stage,
    decision: row.decision,
    remarks: row.remarks,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
  };
}

const COLUMN: Record<keyof PropertyDetails, keyof PropertyRow> = {
  title: "title",
  address: "address",
  mapUrl: "map_url",
  latitude: "latitude",
  longitude: "longitude",
  ownerName: "owner_name",
  areaSqft: "area_sqft",
  rentPerMonth: "rent_per_month",
  securityDeposit: "security_deposit",
  advanceRent: "advance_rent",
  leaseTenureMonths: "lease_tenure_months",
  rentEscalationPct: "rent_escalation_pct",
  rentFreeDays: "rent_free_days",
  handoverDate: "handover_date",
  lockInMonths: "lock_in_months",
  notes: "notes",
};

/** Builds what this viewer may see: hidden fields come back null, and hidden media/decisions are dropped. */
function toView(viewer: User, row: PropertyRow, media: MediaRow[], decisions: DecisionRow[]): PropertyView {
  const visibility = visibilityFor(viewer.role);
  const details = {} as Record<keyof PropertyDetails, unknown>;
  for (const field of PROPERTY_FIELDS) {
    details[field] = visibility.fields.has(field) ? row[COLUMN[field]] : null;
  }
  const stages = visibleDecisionStages(viewer.role);
  return {
    ...(details as unknown as PropertyDetails),
    id: row.id,
    code: propertyCode(row.id),
    status: row.status,
    round: row.round,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    mediaVisible: visibility.media,
    media: visibility.media ? media.map(toMedia) : [],
    decisions: decisions.filter((d) => stages.includes(d.stage)).map(toDecision),
  };
}

function loadRelated(ids: number[]) {
  const media = new Map<number, MediaRow[]>();
  const decisions = new Map<number, DecisionRow[]>();
  if (ids.length === 0) return { media, decisions };
  const placeholders = ids.map(() => "?").join(",");
  for (const m of db()
    .prepare(`SELECT * FROM media WHERE property_id IN (${placeholders}) ORDER BY created_at, id`)
    .all(...ids) as unknown as MediaRow[]) {
    media.set(m.property_id, [...(media.get(m.property_id) ?? []), m]);
  }
  for (const d of db()
    .prepare(
      `SELECT d.*, u.name AS decided_by_name FROM decisions d JOIN users u ON u.id = d.decided_by
       WHERE d.property_id IN (${placeholders}) ORDER BY d.round, d.id`,
    )
    .all(...ids) as unknown as DecisionRow[]) {
    decisions.set(d.property_id, [...(decisions.get(d.property_id) ?? []), d]);
  }
  return { media, decisions };
}

function viewsFor(viewer: User, rows: PropertyRow[]): PropertyView[] {
  const { media, decisions } = loadRelated(rows.map((r) => r.id));
  return rows.map((r) => toView(viewer, r, media.get(r.id) ?? [], decisions.get(r.id) ?? []));
}

function rowById(id: number): PropertyRow | undefined {
  return db().prepare(`${SELECT_PROPERTY} WHERE p.id = ?`).get(id) as PropertyRow | undefined;
}

export function getProperty(viewer: User, id: number): PropertyView | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  const access = accessCondition(viewer);
  const row = db()
    .prepare(`${SELECT_PROPERTY} WHERE p.id = ? AND (${access.sql})`)
    .get(id, ...access.params) as PropertyRow | undefined;
  return row ? viewsFor(viewer, [row])[0] : null;
}

export interface PropertyFilter {
  /** Exact status, or "in_review" for any pending_* status. */
  status?: PropertyStatus | "in_review" | "passed";
  search?: string;
}

export function listProperties(viewer: User, filter: PropertyFilter = {}): PropertyView[] {
  const access = accessCondition(viewer);
  const where = [`(${access.sql})`];
  const params: (string | number)[] = [...access.params];
  if (filter.status === "in_review") where.push("p.status LIKE 'pending_%'");
  else if (filter.status === "passed") where.push("p.status LIKE 'passed_%'");
  else if (filter.status) {
    where.push("p.status = ?");
    params.push(filter.status);
  }
  const search = filter.search?.trim();
  if (search) {
    const idMatch = search.match(/^(?:pr-?)?0*(\d+)$/i);
    where.push("(p.title LIKE ? OR p.address LIKE ? OR u.name LIKE ? OR p.id = ?)");
    const like = `%${search.replace(/[%_]/g, "")}%`;
    params.push(like, like, like, idMatch ? Number(idMatch[1]) : -1);
  }
  const rows = db()
    .prepare(`${SELECT_PROPERTY} WHERE ${where.join(" AND ")} ORDER BY COALESCE(p.submitted_at, p.updated_at) DESC, p.id DESC`)
    .all(...params) as unknown as PropertyRow[];
  return viewsFor(viewer, rows);
}

/** A reviewer's queue: waiting on their team vs already decided by it. */
export function reviewQueue(viewer: User): { pending: PropertyView[]; reviewed: PropertyView[] } {
  const stage = reviewerStage(viewer.role);
  if (!stage) throw new PropertyError("Only review teams have a review queue.");
  const all = listProperties(viewer);
  return {
    pending: all.filter((p) => p.status === pendingStatus(stage)),
    reviewed: all.filter((p) => p.status !== pendingStatus(stage)),
  };
}

export function pendingCount(viewer: User): number {
  const stage = reviewerStage(viewer.role);
  if (!stage) return 0;
  return (db().prepare("SELECT COUNT(*) AS n FROM properties WHERE status = ?").get(pendingStatus(stage)) as { n: number }).n;
}

export interface DashboardStats {
  total: number;
  drafts: number;
  byStatus: Partial<Record<PropertyStatus, number>>;
  approvedArea: number;
}

export function dashboardStats(): DashboardStats {
  const rows = db().prepare("SELECT status, COUNT(*) AS n FROM properties GROUP BY status").all() as unknown as {
    status: PropertyStatus;
    n: number;
  }[];
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n])) as DashboardStats["byStatus"];
  const area = db().prepare("SELECT COALESCE(SUM(area_sqft), 0) AS a FROM properties WHERE status = 'approved'").get() as {
    a: number;
  };
  return {
    total: rows.reduce((sum, r) => sum + r.n, 0),
    drafts: byStatus.draft ?? 0,
    byStatus,
    approvedArea: area.a,
  };
}

// --- Mutations by the real estate manager -----------------------------------

function values(input: PropertyInput) {
  return [
    input.title,
    input.address,
    input.mapUrl,
    input.latitude,
    input.longitude,
    input.ownerName,
    input.areaSqft,
    input.rentPerMonth,
    input.securityDeposit,
    input.advanceRent,
    input.leaseTenureMonths,
    input.rentEscalationPct,
    input.rentFreeDays,
    input.handoverDate,
    input.lockInMonths,
    input.notes,
  ];
}

function requireUploader(viewer: User) {
  if (viewer.role !== "real_estate") throw new PropertyError("Only real estate managers can add or change properties.");
}

/** Loads a property its uploader is about to change, checking ownership and that it isn't locked in review. */
export function ownEditableProperty(viewer: User, id: number): PropertyRow {
  requireUploader(viewer);
  const row = rowById(id);
  if (!row || row.created_by !== viewer.id) throw new PropertyError("Property not found.");
  if (!isEditable(row.status)) {
    throw new PropertyError("This property is under review and can't be changed until a team passes it.");
  }
  return row;
}

export function createProperty(viewer: User, input: PropertyInput): number {
  requireUploader(viewer);
  return tx(() => {
    const at = now();
    const result = db()
      .prepare(
        `INSERT INTO properties (status, title, address, map_url, latitude, longitude, owner_name, area_sqft,
           rent_per_month, security_deposit, advance_rent, lease_tenure_months, rent_escalation_pct,
           rent_free_days, handover_date, lock_in_months, notes, created_by, created_at, updated_at)
         VALUES ('draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...values(input), viewer.id, at, at);
    const id = Number(result.lastInsertRowid);
    audit({ actorId: viewer.id, action: "property.created", propertyId: id });
    return id;
  });
}

export function updateProperty(viewer: User, id: number, input: PropertyInput) {
  tx(() => {
    ownEditableProperty(viewer, id);
    db()
      .prepare(
        `UPDATE properties SET title = ?, address = ?, map_url = ?, latitude = ?, longitude = ?, owner_name = ?,
           area_sqft = ?, rent_per_month = ?, security_deposit = ?, advance_rent = ?, lease_tenure_months = ?,
           rent_escalation_pct = ?, rent_free_days = ?, handover_date = ?, lock_in_months = ?, notes = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .run(...values(input), now(), id);
    audit({ actorId: viewer.id, action: "property.updated", propertyId: id });
  });
}

/** Drafts that never entered review can be thrown away. Returns media ids so their files can be removed. */
export function deleteDraft(viewer: User, id: number): string[] {
  return tx(() => {
    const row = ownEditableProperty(viewer, id);
    if (row.status !== "draft") throw new PropertyError("Only drafts can be deleted.");
    const media = db().prepare("SELECT id FROM media WHERE property_id = ?").all(id) as { id: string }[];
    db().prepare("DELETE FROM properties WHERE id = ?").run(id);
    return media.map((m) => m.id);
  });
}

/** Sends a draft (or a passed property, after revisions) to sales for a new review round. */
export function submitProperty(viewer: User, id: number) {
  tx(() => {
    const row = ownEditableProperty(viewer, id);
    const mediaCount = (db().prepare("SELECT COUNT(*) AS n FROM media WHERE property_id = ?").get(id) as { n: number }).n;
    if (mediaCount === 0) throw new PropertyError("Add at least one photo or video before submitting.");

    const resubmission = row.round > 0;
    db()
      .prepare("UPDATE properties SET status = ?, round = round + 1, submitted_at = ?, updated_at = ? WHERE id = ?")
      .run(pendingStatus("sales"), now(), now(), id);
    audit({ actorId: viewer.id, action: resubmission ? "property.resubmitted" : "property.submitted", propertyId: id });

    const code = propertyCode(id);
    notifyRole("sales", {
      propertyId: id,
      title: `${resubmission ? "Resubmitted" : "New"} property for review: ${code} ${row.title}`,
      body: `${viewer.name} ${resubmission ? "revised and resubmitted" : "submitted"} ${row.title} (${formatNumber(row.area_sqft, " sq ft")}). Review the location and media and approve or pass it with remarks.`,
      link: `${ROLE_INFO.sales.portal}/properties/${id}`,
    });
  });
}

// --- Review decisions -------------------------------------------------------

export function decide(viewer: User, id: number, decision: Decision, remarksRaw: string) {
  const stage = reviewerStage(viewer.role);
  if (!stage) throw new PropertyError("Only review teams can approve or pass properties.");
  if (decision !== "approved" && decision !== "passed") throw new PropertyError("Choose approve or pass.");
  const remarks = remarksRaw.trim();
  if (remarks.length < 3) throw new PropertyError("Remarks are required for both approve and pass.");
  if (remarks.length > 5000) throw new PropertyError("Remarks must be at most 5000 characters.");

  tx(() => {
    const row = rowById(id);
    if (!row || !getProperty(viewer, id)) throw new PropertyError("Property not found.");
    if (pendingStage(row.status) !== stage) {
      throw new PropertyError("This property is no longer waiting on your team — someone may have just reviewed it.");
    }
    const at = now();
    db()
      .prepare(
        `INSERT INTO decisions (property_id, round, stage, decision, remarks, decided_by, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, row.round, stage, decision, remarks, viewer.id, at);
    const status = nextStatus(stage, decision);
    const updated = db()
      .prepare("UPDATE properties SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
      .run(status, at, id, row.status);
    if (updated.changes !== 1) throw new PropertyError("This property changed while you were reviewing it. Reload and try again.");
    audit({ actorId: viewer.id, action: `decision.${stage}.${decision}`, propertyId: id, details: remarks });

    const code = propertyCode(id);
    const team = STAGE_LABEL[stage];
    const verb = DECISION_LABEL[decision].toLowerCase();
    const finalApproval = status === "approved";

    notifyUser(row.created_by, {
      propertyId: id,
      title: `${team} ${verb} ${code} ${row.title}`,
      body: `${team} (${viewer.name}) ${verb} this property.${finalApproval ? " All three teams have now approved it." : ""}\n\nRemarks: ${remarks}`,
      link: `${ROLE_INFO.real_estate.portal}/properties/${id}`,
    });

    const next = pendingStage(status);
    if (next) {
      const approvedBy = STAGES.slice(0, STAGES.indexOf(next))
        .map((s) => STAGE_LABEL[s])
        .join(" and ");
      notifyRole(next, {
        propertyId: id,
        title: `Awaiting your review: ${code} ${row.title}`,
        body: `${approvedBy} approved this property. It's now waiting on ${STAGE_LABEL[next]} to approve or pass it.`,
        link: `${ROLE_INFO[next].portal}/properties/${id}`,
      });
    }
  });
}

// --- Media ------------------------------------------------------------------

export function mediaCount(propertyId: number): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM media WHERE property_id = ?").get(propertyId) as { n: number }).n;
}

export function insertMedia(
  viewer: User,
  propertyId: number,
  media: { id: string; kind: "image" | "video"; mime: string; originalName: string; sizeBytes: number },
) {
  tx(() => {
    ownEditableProperty(viewer, propertyId);
    db()
      .prepare(
        `INSERT INTO media (id, property_id, kind, mime, original_name, size_bytes, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(media.id, propertyId, media.kind, media.mime, media.originalName, media.sizeBytes, viewer.id, now());
    db().prepare("UPDATE properties SET updated_at = ? WHERE id = ?").run(now(), propertyId);
    audit({ actorId: viewer.id, action: "media.added", propertyId, details: media.originalName });
  });
}

/** Removes a media record; returns its property id so the caller can delete the file. */
export function deleteMedia(viewer: User, mediaId: string): number {
  return tx(() => {
    const m = db().prepare("SELECT * FROM media WHERE id = ?").get(mediaId) as MediaRow | undefined;
    if (!m) throw new PropertyError("File not found.");
    ownEditableProperty(viewer, m.property_id);
    db().prepare("DELETE FROM media WHERE id = ?").run(mediaId);
    audit({ actorId: viewer.id, action: "media.removed", propertyId: m.property_id, details: m.original_name });
    return m.property_id;
  });
}

/** The media record if this viewer may see it (has access to the property and their role may see media). */
export function viewableMedia(viewer: User, mediaId: string): (MediaItem & { propertyId: number }) | null {
  const m = db().prepare("SELECT * FROM media WHERE id = ?").get(mediaId) as MediaRow | undefined;
  if (!m || !visibilityFor(viewer.role).media) return null;
  if (!getProperty(viewer, m.property_id)) return null;
  return { ...toMedia(m), propertyId: m.property_id };
}
