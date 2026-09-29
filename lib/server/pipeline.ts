import "server-only";
import { formatINR, propertyCode } from "@/lib/expansion/format";
import type { OwnerInput, PaymentInput, StampDutyRequestInput } from "@/lib/expansion/propertyInput";
import type { User } from "@/lib/expansion/types";
import {
  afterDecision,
  afterTask,
  CATEGORY_INFO,
  DECISION_LABEL,
  missingDocuments,
  STAGE_INFO,
  STAMP_DUTY_REQUESTERS,
  stageIndex,
  type Decision,
  type FileCategory,
  type Stage,
} from "@/lib/expansion/workflow";
import { audit } from "./audit";
import { db, now, tx } from "./db";
import { attachToPayment, pendingAttachments } from "./files";
import { emailEnabled, sendEmail } from "./mailer";
import { notifyRole, notifyUser, type NewNotification } from "./notifications";
import {
  activeFiles,
  canAccess,
  moveTo,
  ownProperty,
  propertyRow,
  PropertyError,
  requireRole,
  type PropertyRow,
} from "./properties";
import { getSettings } from "./settings";
import { localPath } from "./blobStore";

// Every step of the pipeline after submission: review decisions, the ops
// visit, documents, LOI, agreement and payments. Each function checks the
// viewer's role and the property's current stage inside a transaction, so
// two people acting at once can't both move the same property.

function link(id: number) {
  return `/properties/${id}`;
}

function label(row: PropertyRow) {
  return `${propertyCode(row.id)} ${row.store_name}`;
}

/** Loads the property and checks it's waiting at `stage` (and, unless allowed, not on hold). */
function atStage(viewer: User, id: number, stage: Stage, allowHold = false): PropertyRow {
  requireRole(viewer, STAGE_INFO[stage].actor);
  const row = propertyRow(id);
  if (!row || !canAccess(viewer, row)) throw new PropertyError("Property not found.");
  const ok = row.stage === stage && (row.state === "active" || (allowHold && row.state === "on_hold"));
  if (!ok) throw new PropertyError(`This property isn't waiting on ${STAGE_INFO[stage].label.toLowerCase()} right now — it may have just moved on.`);
  return row;
}

/** Sales approvers get the request to decide; the rest of the sales team get it for information. */
function notifySalesTeam(approvers: NewNotification, viewers: NewNotification) {
  const members = db().prepare("SELECT id, sales_approver FROM users WHERE role = 'sales' AND status = 'active'").all() as {
    id: string;
    sales_approver: number;
  }[];
  for (const m of members) notifyUser(m.id, m.sales_approver ? approvers : viewers);
}

function notifyMany(targets: { user?: string; roles?: Parameters<typeof notifyRole>[0][] }, n: NewNotification) {
  if (targets.user) notifyUser(targets.user, n);
  for (const r of targets.roles ?? []) notifyRole(r, n);
}

// --- Review decisions ---------------------------------------------------------

const REVIEW_STAGES: Stage[] = ["em_review", "bl_review", "sales_review", "ops_review", "founder_review"];

export function decide(viewer: User, id: number, decision: Decision, remarksRaw: string) {
  const remarks = remarksRaw.trim();
  if (remarks.length < 3) throw new PropertyError("Remarks are required for every decision.");
  if (remarks.length > 5000) throw new PropertyError("Remarks must be at most 5000 characters.");
  const stage = REVIEW_STAGES.find((s) => STAGE_INFO[s].actor === viewer.role);
  if (!stage) throw new PropertyError("Your role doesn't review properties.");
  const info = STAGE_INFO[stage];
  if (!info.decisions.includes(decision)) throw new PropertyError(`${info.label} can't ${decision === "hold" ? "hold" : decision} a property.`);

  tx(() => {
    const row = atStage(viewer, id, stage, true);
    if (decision === "hold" && row.state === "on_hold") throw new PropertyError("This property is already on hold.");

    if (stage === "sales_review") {
      if (!viewer.salesApprover) {
        throw new PropertyError("You have view access to sales reviews. Approvals are given by the designated sales approvers.");
      }
      const voted = db()
        .prepare("SELECT 1 FROM decisions WHERE property_id = ? AND round = ? AND stage = ? AND decided_by = ?")
        .get(id, row.round, stage, viewer.id);
      if (voted) throw new PropertyError("You've already given your decision on this property.");
    }
    if (stage === "ops_review" && decision === "approved") {
      const visit = db().prepare("SELECT visited_at FROM ops_visits WHERE property_id = ? AND round = ?").get(id, row.round) as
        | { visited_at: string | null }
        | undefined;
      if (!visit?.visited_at) throw new PropertyError("Mark the property as visited before approving it.");
    }

    db()
      .prepare("INSERT INTO decisions (property_id, round, stage, decision, remarks, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, row.round, stage, decision, remarks, viewer.id, now());
    audit({ actorId: viewer.id, action: `decision.${stage}.${decision}`, propertyId: id, details: remarks });

    // Sales is a team vote: the stage resolves once enough members agree.
    let outcome: Decision | null = decision;
    if (stage === "sales_review") {
      const { salesApprovalsRequired, salesRejectionsRequired } = getSettings();
      const counts = db()
        .prepare("SELECT decision, COUNT(*) AS n FROM decisions WHERE property_id = ? AND round = ? AND stage = 'sales_review' GROUP BY decision")
        .all(id, row.round) as { decision: Decision; n: number }[];
      const n = (d: Decision) => counts.find((c) => c.decision === d)?.n ?? 0;
      outcome = n("rejected") >= salesRejectionsRequired ? "rejected" : n("approved") >= salesApprovalsRequired ? "approved" : null;

      notifyUser(row.created_by, {
        propertyId: id,
        title: `Sales: ${viewer.name} voted to ${decision === "approved" ? "approve" : "reject"} ${label(row)}`,
        body: `Remarks: ${remarks}${outcome ? "" : `\n\nSales votes so far: ${n("approved")} approve, ${n("rejected")} reject.`}`,
        link: link(id),
      });
    }
    if (!outcome) return;

    const result = afterDecision(stage, outcome);
    moveTo(id, result.stage, result.state);
    notifyDecision(viewer, row, stage, outcome, remarks);
  });
}

function notifyDecision(viewer: User, row: PropertyRow, stage: Stage, decision: Decision, remarks: string) {
  const id = row.id;
  const verb = decision === "hold" ? "put on hold" : DECISION_LABEL[decision].toLowerCase();
  const who = stage === "sales_review" ? "Sales team" : `${STAGE_INFO[stage].label.replace(/ review| approval| site visit/i, "")} (${viewer.name})`;
  const n = (title: string, body: string): NewNotification => ({ propertyId: id, title, body, link: link(id) });
  const decided = n(`${who} ${verb} ${label(row)}`, `Remarks: ${remarks}`);

  switch (stage) {
    case "em_review":
      notifyMany({ user: row.created_by }, decided);
      if (decision === "approved") {
        notifyRole("business", n(`Awaiting your review: ${label(row)}`, "The Expansion Manager approved this property. Approve, hold or reject it."));
      }
      break;
    case "bl_review":
      notifyMany({ user: row.created_by, roles: ["expansion_manager"] }, decided);
      if (decision === "approved") {
        notifySalesTeam(
          n(`Awaiting your decision: ${label(row)}`, "Business Leaders approved this property. Review the details and media and approve or reject it."),
          n(`For your review: ${label(row)}`, "Business Leaders approved this property. You have view access; the designated sales approvers will decide."),
        );
      }
      break;
    case "sales_review":
      notifyMany({ user: row.created_by, roles: ["expansion_manager"] }, n(`Sales team ${verb} ${label(row)}`, `Latest remarks: ${remarks}`));
      if (decision === "approved") {
        notifyRole("ops", n(`Site visit needed: ${label(row)}`, "Sales approved this property. Visit it, upload photos/videos, write the scope of work and approve or reject."));
      }
      break;
    case "ops_review":
      notifyMany({ roles: ["expansion_manager"] }, decided);
      notifyUser(
        row.created_by,
        decision === "approved"
          ? n(`Ops approved ${label(row)} — upload documents`, `Remarks: ${remarks}\n\nPlease upload the owner KYC, bank details and property documents.`)
          : decided,
      );
      break;
    case "founder_review":
      notifyMany({ user: row.created_by, roles: ["expansion_manager"] }, decided);
      if (decision === "approved") {
        notifyRole("finance", n(`Release token: ${label(row)}`, "The Founder approved this property. Release the token payment and mark it paid with the UTR."));
      }
      break;
    default:
      break;
  }
}

// --- Ops site visit -------------------------------------------------------------

export function saveVisit(viewer: User, id: number, input: { visited: boolean; scopeOfWork: string }) {
  const scope = input.scopeOfWork.trim();
  if (scope.length > 20000) throw new PropertyError("Scope of work is too long.");
  tx(() => {
    const row = atStage(viewer, id, "ops_review");
    const existing = db().prepare("SELECT visited_at FROM ops_visits WHERE property_id = ? AND round = ?").get(id, row.round) as
      | { visited_at: string | null }
      | undefined;
    const visitedAt = input.visited ? (existing?.visited_at ?? now()) : null;
    db()
      .prepare(
        `INSERT INTO ops_visits (property_id, round, visited_at, visited_by, scope_of_work, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(property_id, round) DO UPDATE SET
           visited_at = excluded.visited_at,
           visited_by = CASE WHEN excluded.visited_at IS NULL THEN NULL WHEN ops_visits.visited_at IS NULL THEN excluded.visited_by ELSE ops_visits.visited_by END,
           scope_of_work = excluded.scope_of_work, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .run(id, row.round, visitedAt, input.visited ? viewer.id : null, scope, viewer.id, now());
    audit({ actorId: viewer.id, action: input.visited && !existing?.visited_at ? "ops.visited" : "ops.visit_updated", propertyId: id });
    if (input.visited && !existing?.visited_at) {
      notifyMany(
        { user: row.created_by, roles: ["expansion_manager"] },
        { propertyId: id, title: `Ops visited ${label(row)}`, body: `${viewer.name} marked the site as visited.`, link: link(id) },
      );
    }
  });
}

// --- Owners & documents (real estate manager) --------------------------------------

function ownDocumentsProperty(viewer: User, id: number): PropertyRow {
  const row = ownProperty(viewer, id);
  if (row.furthest_stage < stageIndex("documents")) throw new PropertyError("Owner details and documents are added after Ops approves the property.");
  if (row.state === "rejected") throw new PropertyError("This property was rejected.");
  return row;
}

function ownerValues(o: OwnerInput) {
  return [
    o.name,
    o.email || null,
    o.phone || null,
    o.isOrganisation ? 1 : 0,
    o.gstNumber || null,
    o.panNumber || null,
    o.bankAccountName || null,
    o.bankAccountNumber || null,
    o.bankIfsc || null,
    o.bankName || null,
  ];
}

export function addOwner(viewer: User, propertyId: number, input: OwnerInput): number {
  return tx(() => {
    ownDocumentsProperty(viewer, propertyId);
    const r = db()
      .prepare(
        `INSERT INTO owners (property_id, name, email, phone, is_organisation, gst_number, pan_number, bank_account_name,
           bank_account_number, bank_ifsc, bank_name, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(propertyId, ...ownerValues(input), viewer.id, now(), now());
    audit({ actorId: viewer.id, action: "owner.added", propertyId, details: input.name });
    return Number(r.lastInsertRowid);
  });
}

export function updateOwner(viewer: User, propertyId: number, ownerId: number, input: OwnerInput) {
  tx(() => {
    ownDocumentsProperty(viewer, propertyId);
    const r = db()
      .prepare(
        `UPDATE owners SET name = ?, email = ?, phone = ?, is_organisation = ?, gst_number = ?, pan_number = ?,
           bank_account_name = ?, bank_account_number = ?, bank_ifsc = ?, bank_name = ?, updated_at = ?
         WHERE id = ? AND property_id = ? AND archived_at IS NULL`,
      )
      .run(...ownerValues(input), now(), ownerId, propertyId);
    if (r.changes !== 1) throw new PropertyError("Owner not found.");
    audit({ actorId: viewer.id, action: "owner.updated", propertyId, details: input.name });
  });
}

export function archiveOwner(viewer: User, propertyId: number, ownerId: number) {
  tx(() => {
    ownDocumentsProperty(viewer, propertyId);
    const r = db()
      .prepare("UPDATE owners SET archived_at = ? WHERE id = ? AND property_id = ? AND archived_at IS NULL")
      .run(now(), ownerId, propertyId);
    if (r.changes !== 1) throw new PropertyError("Owner not found.");
    db().prepare("UPDATE files SET archived_at = ?, archived_by = ? WHERE owner_id = ? AND archived_at IS NULL").run(now(), viewer.id, ownerId);
    audit({ actorId: viewer.id, action: "owner.removed", propertyId });
  });
}

export function documentsChecklist(propertyId: number): string[] {
  const owners = db()
    .prepare("SELECT id, name, is_organisation, bank_account_number FROM owners WHERE property_id = ? AND archived_at IS NULL")
    .all(propertyId) as { id: number; name: string; is_organisation: number; bank_account_number: string | null }[];
  const files = activeFiles(propertyId);
  return missingDocuments(
    owners.map((o) => ({
      name: o.name,
      isOrganisation: o.is_organisation === 1,
      hasBankDetails: Boolean(o.bank_account_number),
      categories: files.filter((f) => f.owner_id === o.id).map((f) => f.category),
    })),
    files.filter((f) => !f.owner_id).map((f) => f.category),
  );
}

export function completeDocuments(viewer: User, id: number) {
  tx(() => {
    const row = atStage(viewer, id, "documents");
    if (row.created_by !== viewer.id) throw new PropertyError("Property not found.");
    const missing = documentsChecklist(id);
    if (missing.length) throw new PropertyError(`Still missing: ${missing.join("; ")}.`);
    db().prepare("UPDATE properties SET documents_completed_at = ? WHERE id = ?").run(now(), id);
    const next = afterTask("documents");
    moveTo(id, next.stage, next.state);
    audit({ actorId: viewer.id, action: "documents.completed", propertyId: id });
    notifyRole("expansion_manager", {
      propertyId: id,
      title: `Documents uploaded: ${label(row)}`,
      body: `${viewer.name} uploaded the owner and property documents. Prepare the LOI and upload it to send it to the landowner.`,
      link: link(id),
    });
  });
}

// --- LOI ---------------------------------------------------------------------

export interface LoiResult {
  emailedTo: string[];
  emailConfigured: boolean;
}

export function sendLoi(viewer: User, id: number): LoiResult {
  return tx(() => {
    const row = propertyRow(id);
    const resend = row?.stage === "signed_loi";
    const checked = atStage(viewer, id, resend ? "signed_loi" : "loi");
    const lois = activeFiles(id, "loi");
    if (lois.length === 0) throw new PropertyError("Upload the LOI first.");
    const owners = db()
      .prepare("SELECT name, email FROM owners WHERE property_id = ? AND archived_at IS NULL AND email IS NOT NULL")
      .all(id) as { name: string; email: string }[];
    const configured = emailEnabled();
    if (configured && owners.length === 0) {
      throw new PropertyError("No owner has an email address. Ask the real estate manager to add the landowner's email under owner details.");
    }
    const latest = lois[lois.length - 1];
    for (const o of configured ? owners : []) {
      sendEmail({
        to: o.email,
        subject: `Letter of Intent — ${checked.store_name}`,
        text: `Dear ${o.name},\n\nPlease find attached the Letter of Intent for your property (${checked.store_name}, ${checked.address}).\n\nKindly review and sign it; our real estate manager will coordinate collecting the signed copy.\n\nRegards,\n${viewer.name}`,
        attachments: [{ filename: latest.original_name, path: localPath(latest.storage_key), contentType: latest.mime }],
      });
    }
    const sentTo = configured ? owners.map((o) => o.email).join(", ") : null;
    db().prepare("UPDATE properties SET loi_sent_at = ?, loi_sent_to = ? WHERE id = ?").run(now(), sentTo, id);
    if (!resend) {
      const next = afterTask("loi");
      moveTo(id, next.stage, next.state);
    }
    audit({ actorId: viewer.id, action: resend ? "loi.resent" : "loi.sent", propertyId: id, details: sentTo ?? "not emailed (SMTP not configured)" });
    notifyUser(checked.created_by, {
      propertyId: id,
      title: `LOI ${resend ? "re-issued" : "issued"}: ${label(checked)}`,
      body: `${viewer.name} uploaded the LOI${sentTo ? ` and emailed it to ${sentTo}` : ""}. Please get it signed by the landlord and share the signed copy with the Expansion Manager.`,
      link: link(id),
    });
    return { emailedTo: configured ? owners.map((o) => o.email) : [], emailConfigured: configured };
  });
}

export function confirmSignedLoi(viewer: User, id: number) {
  tx(() => {
    const row = atStage(viewer, id, "signed_loi");
    if (activeFiles(id, "signed_loi").length === 0) throw new PropertyError("Upload the signed LOI first.");
    const next = afterTask("signed_loi");
    moveTo(id, next.stage, next.state);
    audit({ actorId: viewer.id, action: "loi.signed_uploaded", propertyId: id });
    notifyRole("founder", {
      propertyId: id,
      title: `Approval needed: ${label(row)}`,
      body: "Expansion Manager, Business Leaders, Sales and Ops have approved this property and the signed LOI is in. Approve, hold or reject it.",
      link: link(id),
    });
    notifyUser(row.created_by, { propertyId: id, title: `Signed LOI received: ${label(row)}`, body: "Sent to the Founder for approval.", link: link(id) });
  });
}

// --- Agreement ---------------------------------------------------------------

export function confirmAgreement(viewer: User, id: number) {
  tx(() => {
    const row = atStage(viewer, id, "agreement");
    if (activeFiles(id, "agreement").length === 0) throw new PropertyError("Upload the signed agreement first.");
    const next = afterTask("agreement");
    moveTo(id, next.stage, next.state);
    audit({ actorId: viewer.id, action: "agreement.uploaded", propertyId: id });
    notifyRole("finance", {
      propertyId: id,
      title: `Release balance: ${label(row)}`,
      body: "The signed agreement is uploaded. Release the remaining amount to the landlord and mark it paid with the UTR.",
      link: link(id),
    });
    notifyMany(
      { user: row.created_by, roles: ["founder"] },
      { propertyId: id, title: `Agreement signed: ${label(row)}`, body: "The signed agreement has been uploaded and sent to Finance for the balance payment.", link: link(id) },
    );
  });
}

// --- Payments ------------------------------------------------------------------

const RECEIPT: Record<"token" | "balance" | "stamp_duty", FileCategory> = {
  token: "token_receipt",
  balance: "balance_receipt",
  stamp_duty: "stamp_duty_receipt",
};

function requireReceipt(propertyId: number, kind: keyof typeof RECEIPT) {
  const receipts = pendingAttachments(propertyId, RECEIPT[kind]);
  if (receipts.length === 0) throw new PropertyError(`Upload the ${CATEGORY_INFO[RECEIPT[kind]].label.toLowerCase()} first.`);
  return receipts;
}

function duplicateUtr(utr: string) {
  const existing = db().prepare("SELECT property_id FROM payments WHERE utr = ?").get(utr) as { property_id: number } | undefined;
  if (existing) throw new PropertyError(`UTR ${utr} is already recorded for ${propertyCode(existing.property_id)}.`);
}

export function recordPayment(viewer: User, id: number, kind: "token" | "balance", input: PaymentInput) {
  const stage: Stage = kind === "token" ? "token_payment" : "balance_payment";
  tx(() => {
    const row = atStage(viewer, id, stage);
    duplicateUtr(input.utr);
    const receipts = requireReceipt(id, kind);
    const r = db()
      .prepare(
        `INSERT INTO payments (property_id, kind, status, amount, utr, paid_on, paid_by, paid_at, notes)
         VALUES (?, ?, 'paid', ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, kind, input.amount, input.utr, input.paidOn, viewer.id, now(), input.notes || null);
    attachToPayment(receipts.map((f) => f.id), Number(r.lastInsertRowid));
    const next = afterTask(stage);
    moveTo(id, next.stage, next.state);
    audit({ actorId: viewer.id, action: `payment.${kind}`, propertyId: id, details: `${formatINR(input.amount)} · UTR ${input.utr}` });

    const what = kind === "token" ? "Token" : "Balance";
    const body = `${viewer.name} released ${formatINR(input.amount)} (UTR ${input.utr}, paid ${input.paidOn}).${
      kind === "token" ? " Next: share the agreement, get it signed and upload it." : " All payments are complete."
    }`;
    notifyMany({ roles: ["expansion_manager", "founder"] }, { propertyId: id, title: `${what} paid: ${label(row)}`, body, link: link(id) });
    notifyUser(row.created_by, { propertyId: id, title: `${what} paid: ${label(row)}`, body: `${what} payment of ${formatINR(input.amount)} released.`, link: link(id) });
  });
}

export function requestStampDuty(viewer: User, id: number, input: StampDutyRequestInput) {
  requireRole(viewer, ...STAMP_DUTY_REQUESTERS);
  tx(() => {
    const row = propertyRow(id);
    if (!row) throw new PropertyError("Property not found.");
    if (row.furthest_stage < stageIndex("token_payment")) throw new PropertyError("Stamp duty can be requested once the Founder has approved the property.");
    const calc = pendingAttachments(id, "stamp_duty_calculation");
    if (calc.length === 0) throw new PropertyError("Upload the stamp duty calculation PDF first.");
    const r = db()
      .prepare(
        `INSERT INTO payments (property_id, kind, status, requested_amount, requested_by, requested_at, request_remarks)
         VALUES (?, 'stamp_duty', 'requested', ?, ?, ?, ?)`,
      )
      .run(id, input.amount, viewer.id, now(), input.remarks || null);
    attachToPayment(calc.map((f) => f.id), Number(r.lastInsertRowid));
    audit({ actorId: viewer.id, action: "stamp_duty.requested", propertyId: id, details: formatINR(input.amount) });
    notifyMany(
      { roles: ["finance", "founder"] },
      {
        propertyId: id,
        title: `Stamp duty requested: ${label(row)}`,
        body: `${viewer.name} requested ${formatINR(input.amount)} for lease registration stamp duty.${input.remarks ? `\n\n${input.remarks}` : ""}`,
        link: link(id),
      },
    );
  });
}

export function payStampDuty(viewer: User, paymentId: number, input: PaymentInput) {
  requireRole(viewer, "finance");
  tx(() => {
    const p = db().prepare("SELECT property_id, status FROM payments WHERE id = ? AND kind = 'stamp_duty'").get(paymentId) as
      | { property_id: number; status: string }
      | undefined;
    const row = p ? propertyRow(p.property_id) : undefined;
    if (!p || !row || !canAccess(viewer, row)) throw new PropertyError("Stamp duty request not found.");
    if (p.status !== "requested") throw new PropertyError("This stamp duty request is already paid.");
    duplicateUtr(input.utr);
    const receipts = requireReceipt(row.id, "stamp_duty");
    db()
      .prepare("UPDATE payments SET status = 'paid', amount = ?, utr = ?, paid_on = ?, paid_by = ?, paid_at = ?, notes = ? WHERE id = ?")
      .run(input.amount, input.utr, input.paidOn, viewer.id, now(), input.notes || null, paymentId);
    attachToPayment(receipts.map((f) => f.id), paymentId);
    db().prepare("UPDATE properties SET updated_at = ? WHERE id = ?").run(now(), row.id);
    audit({ actorId: viewer.id, action: "payment.stamp_duty", propertyId: row.id, details: `${formatINR(input.amount)} · UTR ${input.utr}` });
    notifyMany(
      { roles: ["expansion_manager", "founder"] },
      {
        propertyId: row.id,
        title: `Stamp duty paid: ${label(row)}`,
        body: `${viewer.name} released ${formatINR(input.amount)} (UTR ${input.utr}, paid ${input.paidOn}).`,
        link: link(row.id),
      },
    );
  });
}
