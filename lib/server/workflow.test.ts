import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseOwnerInput, parsePaymentInput, parsePropertyInput, type OwnerInput, type PropertyInput } from "@/lib/expansion/propertyInput";
import type { Role } from "@/lib/expansion/roles";
import type { User } from "@/lib/expansion/types";
import type { FileCategory } from "@/lib/expansion/workflow";

const sent: { to: string; subject: string; attachments?: unknown[] }[] = [];
vi.mock("./mailer", () => ({
  emailEnabled: () => true,
  sendEmail: (e: { to: string; subject: string; attachments?: unknown[] }) => sent.push(e),
}));

const { db, resetDbForTests } = await import("./db");
const { listNotifications } = await import("./notifications");
const { createProperty, getProperty, listProperties, actionQueue, submitProperty, updateProperty } = await import("./properties");
const pipeline = await import("./pipeline");
const { saveUpload, archiveFile, viewableFile } = await import("./files");
const { runBackup, listBackups } = await import("./backups");
const { updateSettings } = await import("./settings");
const { authenticate, inviteUser, redeemToken, changeRole, setUserEnabled } = await import("./users");

const INPUT: PropertyInput = {
  storeName: "Rohini Sec-7 Dark Store",
  address: "Plot 12, Sector 7, Rohini, Delhi",
  mapUrl: "https://www.google.com/maps/@28.7041,77.1025,17z",
  latitude: 28.7041,
  longitude: 77.1025,
  totalAreaSqft: 6500,
  carpetAreaSqft: 6000,
  askingRent: 185000,
  securityDeposit: 555000,
  advanceRent: 185000,
  lockInMonths: 36,
  structureType: "rcc",
  structureHeightFt: 18,
  rentFreeDays: 30,
  handoverDate: "2026-11-01",
  leaseTenureMonths: 108,
  rentEscalationPct: 5,
  notes: "Owner open to 45 rent-free days.",
};

const OWNER: OwnerInput = {
  name: "R. K. Sharma",
  email: "rk.sharma@example.com",
  phone: "9876543210",
  isOrganisation: false,
  gstNumber: "",
  panNumber: "ABCDE1234F",
  bankAccountName: "R K Sharma",
  bankAccountNumber: "123456789012",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");

let seq = 0;
function makeUser(role: Role, name: string = role): User {
  const id = `user-${++seq}`;
  db()
    .prepare("INSERT INTO users (id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)")
    .run(id, `${id}@example.com`, name, role, new Date().toISOString());
  return { id, email: `${id}@example.com`, name, role, status: "active", lastLoginAt: null, createdAt: "" };
}

function upload(user: User, propertyId: number, category: FileCategory, opts: { ownerId?: number; pdf?: boolean } = {}) {
  const bytes = opts.pdf ? PDF : PNG;
  return saveUpload(user, propertyId, {
    category,
    ownerId: opts.ownerId ?? null,
    mime: opts.pdf ? "application/pdf" : "image/png",
    originalName: `${category}.${opts.pdf ? "pdf" : "png"}`,
    declaredSize: bytes.length,
    body: new Blob([bytes]).stream(),
  });
}

const payment = (utr: string, amount = 100000) =>
  (parsePaymentInput(new Map(Object.entries({ amount: String(amount), utr, paidOn: "2026-10-01", notes: "" }))) as { ok: true; value: never })
    .value;

let admin: User, em: User, re: User, bl: User, sales: User, sales2: User, ops: User, founder: User, finance: User;
const dataDir = path.resolve(".test-data");

beforeEach(() => {
  resetDbForTests();
  fs.rmSync(dataDir, { recursive: true, force: true });
  sent.length = 0;
  admin = makeUser("admin", "Asha Admin");
  em = makeUser("expansion_manager", "Esha EM");
  re = makeUser("real_estate", "Ravi RE");
  bl = makeUser("business", "Bina BL");
  sales = makeUser("sales", "Sonal Sales");
  sales2 = makeUser("sales", "Sam Sales");
  ops = makeUser("ops", "Om Ops");
  founder = makeUser("founder", "Farhan Founder");
  finance = makeUser("finance", "Fiona Finance");
});

async function submitted(): Promise<number> {
  const id = createProperty(re, INPUT);
  await upload(re, id, "property_media");
  submitProperty(re, id);
  return id;
}

async function toDocuments(id: number) {
  pipeline.decide(em, id, "approved", "Good location");
  pipeline.decide(bl, id, "approved", "Rent fits budget");
  pipeline.decide(sales, id, "approved", "Strong catchment");
  await upload(ops, id, "ops_media");
  pipeline.saveVisit(ops, id, { visited: true, scopeOfWork: "Repaint, 2 new shutters, 63A 3-phase connection" });
  pipeline.decide(ops, id, "approved", "Structure sound");
}

async function uploadDocuments(id: number) {
  const ownerId = pipeline.addOwner(re, id, OWNER);
  for (const c of ["aadhaar_front", "aadhaar_back", "pan_card"] as const) await upload(re, id, c, { ownerId });
  for (const c of ["electricity_bill", "lease_deed", "property_tax_receipt"] as const) await upload(re, id, c, { pdf: true });
  return ownerId;
}

const stageOf = (id: number) => {
  const p = getProperty(admin, id)!;
  return `${p.state}:${p.stage}`;
};

describe("full pipeline", () => {
  it("runs from scouting to balance payment, notifying the right people at each step", async () => {
    const id = await submitted();
    expect(stageOf(id)).toBe("active:em_review");
    expect(listNotifications(em.id)[0].title).toMatch(/New property/);
    expect(getProperty(bl, id)).toBeNull();

    pipeline.decide(em, id, "approved", "Good location");
    expect(stageOf(id)).toBe("active:bl_review");
    expect(listNotifications(re.id)[0].title).toMatch(/Expansion Manager \(Esha EM\) approved/);
    expect(listNotifications(bl.id)[0].title).toMatch(/Awaiting your review/);

    pipeline.decide(bl, id, "hold", "Waiting for Q3 budget");
    expect(stageOf(id)).toBe("on_hold:bl_review");
    expect(listNotifications(em.id)[0].title).toMatch(/put on hold/);
    expect(listNotifications(re.id)[0].title).toMatch(/put on hold/);
    pipeline.decide(bl, id, "approved", "Budget cleared");
    expect(stageOf(id)).toBe("active:sales_review");
    expect(listNotifications(sales.id)).toHaveLength(1);
    expect(listNotifications(sales2.id)).toHaveLength(1);

    pipeline.decide(sales2, id, "approved", "Good catchment");
    expect(stageOf(id)).toBe("active:ops_review");
    expect(listNotifications(ops.id)[0].title).toMatch(/Site visit needed/);

    await upload(ops, id, "ops_media");
    expect(() => pipeline.decide(ops, id, "approved", "ok fine")).toThrow(/Mark the property as visited/);
    pipeline.saveVisit(ops, id, { visited: true, scopeOfWork: "Repaint; 63A connection" });
    expect(listNotifications(em.id)[0].title).toMatch(/Ops visited/);
    pipeline.decide(ops, id, "approved", "Structure sound");
    expect(stageOf(id)).toBe("active:documents");
    expect(listNotifications(re.id)[0].title).toMatch(/upload documents/);

    expect(() => pipeline.completeDocuments(re, id)).toThrow(/Still missing/);
    await uploadDocuments(id);
    pipeline.completeDocuments(re, id);
    expect(stageOf(id)).toBe("active:loi");
    expect(listNotifications(em.id)[0].title).toMatch(/Documents uploaded/);

    expect(() => pipeline.sendLoi(em, id)).toThrow(/Upload the LOI first/);
    await upload(em, id, "loi", { pdf: true });
    const loi = pipeline.sendLoi(em, id);
    expect(loi.emailedTo).toEqual(["rk.sharma@example.com"]);
    const loiMail = sent.find((m) => m.to === "rk.sharma@example.com")!;
    expect(loiMail.subject).toMatch(/Letter of Intent/);
    expect(loiMail.attachments).toHaveLength(1);
    expect(stageOf(id)).toBe("active:signed_loi");
    expect(listNotifications(re.id)[0].title).toMatch(/LOI issued/);

    await upload(em, id, "signed_loi", { pdf: true });
    pipeline.confirmSignedLoi(em, id);
    expect(stageOf(id)).toBe("active:founder_review");
    expect(listNotifications(founder.id)[0].title).toMatch(/Approval needed/);

    pipeline.decide(founder, id, "approved", "Go ahead");
    expect(stageOf(id)).toBe("active:token_payment");
    expect(listNotifications(finance.id)[0].title).toMatch(/Release token/);

    expect(() => pipeline.recordPayment(finance, id, "token", payment("UTR0000000001"))).toThrow(/Upload the token payment/i);
    await upload(finance, id, "token_receipt", { pdf: true });
    pipeline.recordPayment(finance, id, "token", payment("UTR0000000001", 50000));
    expect(stageOf(id)).toBe("active:agreement");
    expect(listNotifications(founder.id)[0].title).toMatch(/Token paid/);
    expect(listNotifications(em.id)[0].title).toMatch(/Token paid/);

    await upload(em, id, "agreement", { pdf: true });
    pipeline.confirmAgreement(em, id);
    expect(stageOf(id)).toBe("active:balance_payment");
    expect(listNotifications(finance.id)[0].title).toMatch(/Release balance/);

    await upload(finance, id, "balance_receipt", { pdf: true });
    expect(() => pipeline.recordPayment(finance, id, "balance", payment("UTR0000000001"))).toThrow(/already recorded/);
    pipeline.recordPayment(finance, id, "balance", payment("UTR0000000002", 690000));
    const done = getProperty(admin, id)!;
    expect(done.state).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(done.payments!.map((p) => [p.kind, p.amount])).toEqual([
      ["token", 50000],
      ["balance", 690000],
    ]);
    expect(done.decisions.map((d) => `${d.stage}:${d.decision}`)).toEqual([
      "em_review:approved",
      "bl_review:hold",
      "bl_review:approved",
      "sales_review:approved",
      "ops_review:approved",
      "founder_review:approved",
    ]);
  });

  it("handles stamp duty as a side request to finance and the founder", async () => {
    const id = await submitted();
    await toDocuments(id);
    expect(() => pipeline.requestStampDuty(em, id, { amount: 42000, remarks: "" })).toThrow(/once the Founder has approved/);
    await uploadDocuments(id);
    pipeline.completeDocuments(re, id);
    await upload(em, id, "loi", { pdf: true });
    pipeline.sendLoi(em, id);
    await upload(em, id, "signed_loi", { pdf: true });
    pipeline.confirmSignedLoi(em, id);
    pipeline.decide(founder, id, "approved", "Go ahead");

    expect(() => pipeline.requestStampDuty(em, id, { amount: 42000, remarks: "" })).toThrow(/calculation PDF/);
    await upload(em, id, "stamp_duty_calculation", { pdf: true });
    pipeline.requestStampDuty(em, id, { amount: 42000, remarks: "Owner wants a registered lease" });
    expect(listNotifications(finance.id)[0].title).toMatch(/Stamp duty requested/);
    expect(listNotifications(founder.id)[0].title).toMatch(/Stamp duty requested/);
    const request = getProperty(finance, id)!.payments!.find((p) => p.kind === "stamp_duty")!;
    expect(request.status).toBe("requested");
    expect(actionQueue(finance).map((p) => p.id)).toContain(id);

    await upload(finance, id, "stamp_duty_receipt", { pdf: true });
    pipeline.payStampDuty(finance, request.id, payment("STAMPUTR12345", 42000));
    expect(listNotifications(em.id)[0].title).toMatch(/Stamp duty paid/);
    expect(() => pipeline.payStampDuty(finance, request.id, payment("STAMPUTR99999"))).toThrow(/already paid/);
    // The main pipeline is unaffected.
    expect(stageOf(id)).toBe("active:token_payment");
  });
});

describe("rejections, holds and votes", () => {
  it("lets the real estate manager revise and resubmit after a rejection", async () => {
    const id = await submitted();
    pipeline.decide(em, id, "approved", "ok go");
    pipeline.decide(bl, id, "rejected", "Rent too high");
    expect(stageOf(id)).toBe("rejected:bl_review");
    expect(listNotifications(re.id)[0].title).toMatch(/rejected/);
    expect(listNotifications(em.id)[0].title).toMatch(/rejected/);
    updateProperty(re, id, { ...INPUT, askingRent: 160000 });
    submitProperty(re, id);
    const p = getProperty(admin, id)!;
    expect(`${p.state}:${p.stage}:${p.round}`).toBe("active:em_review:2");
    // Business keeps access to what it reviewed before.
    expect(getProperty(bl, id)).not.toBeNull();
  });

  it("requires remarks, the right role and the right stage", async () => {
    const id = await submitted();
    expect(() => pipeline.decide(em, id, "approved", " ")).toThrow(/Remarks are required/);
    expect(() => pipeline.decide(em, id, "hold", "not now")).toThrow(/can't hold/);
    expect(() => pipeline.decide(bl, id, "approved", "ok go")).toThrow(/not found|isn't waiting/);
    expect(() => pipeline.decide(re, id, "approved", "ok go")).toThrow(/doesn't review/);
    pipeline.decide(em, id, "approved", "ok go");
    expect(() => pipeline.decide(em, id, "rejected", "changed mind")).toThrow(/isn't waiting/);
  });

  it("counts sales votes against the configured thresholds", async () => {
    updateSettings(admin, { salesApprovalsRequired: 2, salesRejectionsRequired: 2 });
    const id = await submitted();
    pipeline.decide(em, id, "approved", "ok go");
    pipeline.decide(bl, id, "approved", "ok go");
    pipeline.decide(sales, id, "approved", "Good market");
    expect(stageOf(id)).toBe("active:sales_review");
    expect(listNotifications(re.id)[0].body).toMatch(/1 approve, 0 reject/);
    expect(() => pipeline.decide(sales, id, "rejected", "again")).toThrow(/already given/);
    expect(actionQueue(sales)).toHaveLength(0);
    expect(actionQueue(sales2).map((p) => p.id)).toEqual([id]);
    pipeline.decide(sales2, id, "approved", "Agree");
    expect(stageOf(id)).toBe("active:ops_review");
  });

  it("locks editing while in review", async () => {
    const id = createProperty(re, INPUT);
    expect(() => submitProperty(re, id)).toThrow(/at least one photo or video/);
    await upload(re, id, "property_media");
    submitProperty(re, id);
    expect(() => updateProperty(re, id, INPUT)).toThrow(/in review/);
    await expect(upload(re, id, "property_media")).rejects.toThrow(/can't upload/);
    expect(() => createProperty(sales, INPUT)).toThrow(/Your role/);
  });
});

describe("what each role can see", () => {
  it("gives business leaders only store name, area, rent, deposit, rent-free days and advance", async () => {
    const id = await submitted();
    pipeline.decide(em, id, "approved", "ok go");
    const p = getProperty(bl, id)!;
    expect([p.storeName, p.totalAreaSqft, p.carpetAreaSqft, p.askingRent, p.securityDeposit, p.rentFreeDays, p.advanceRent]).toEqual([
      "Rohini Sec-7 Dark Store", 6500, 6000, 185000, 555000, 30, 185000,
    ]);
    expect([p.address, p.mapUrl, p.lockInMonths, p.structureType, p.handoverDate, p.notes]).toEqual([null, null, null, null, null, null]);
    expect(p.files).toEqual([]);
    expect(p.owners).toBeNull();
    expect(p.payments).toBeNull();
  });

  it("gives sales and ops all property details and media, but not owner documents", async () => {
    const id = await submitted();
    await toDocuments(id);
    await uploadDocuments(id);
    for (const viewer of [sales, ops]) {
      const p = getProperty(viewer, id)!;
      expect(p.structureType).toBe("rcc");
      expect(p.files.map((f) => f.category).sort()).toEqual(["ops_media", "property_media"]);
      expect(p.owners).toBeNull();
      expect(p.visit?.scopeOfWork).toMatch(/Repaint/);
    }
    const kyc = getProperty(admin, id)!.files.find((f) => f.category === "aadhaar_front")!;
    expect(viewableFile(sales, kyc.id)).toBeNull();
    expect(viewableFile(founder, kyc.id)).not.toBeNull();
    expect(viewableFile(re, kyc.id)).not.toBeNull();
  });

  it("gives finance the deal summary, signed LOI, agreement and bank details, but not KYC", async () => {
    const id = await submitted();
    await toDocuments(id);
    await uploadDocuments(id);
    pipeline.completeDocuments(re, id);
    expect(getProperty(finance, id)).toBeNull();
    await upload(em, id, "loi", { pdf: true });
    pipeline.sendLoi(em, id);
    await upload(em, id, "signed_loi", { pdf: true });
    pipeline.confirmSignedLoi(em, id);
    pipeline.decide(founder, id, "approved", "Go ahead");
    const p = getProperty(finance, id)!;
    expect([p.totalAreaSqft, p.advanceRent, p.securityDeposit]).toEqual([6500, 185000, 555000]);
    expect(p.askingRent).toBeNull();
    expect(p.files.map((f) => f.category)).toEqual(["signed_loi"]);
    expect(p.owners![0].bank).toMatchObject({ accountNumber: "123456789012", ifsc: "HDFC0001234" });
    expect(p.decisions).toHaveLength(5);
    // Business leaders never see bank details.
    expect(getProperty(bl, id)!.owners).toBeNull();
  });

  it("shows real estate managers only their own properties", async () => {
    const id = await submitted();
    const other = makeUser("real_estate", "Other RE");
    expect(getProperty(other, id)).toBeNull();
    expect(listProperties(other)).toHaveLength(0);
    expect(listProperties(em)).toHaveLength(1);
  });
});

describe("nothing is ever lost", () => {
  it("archives files instead of deleting them, and the database refuses deletes", async () => {
    const id = createProperty(re, INPUT);
    const { id: fileId } = await upload(re, id, "property_media");
    archiveFile(re, fileId);
    expect(getProperty(re, id)!.files).toHaveLength(0);
    const archived = getProperty(admin, id)!.files;
    expect(archived).toHaveLength(1);
    expect(archived[0].archivedAt).not.toBeNull();
    expect(fs.existsSync(path.join(dataDir, "uploads", String(id), fileId))).toBe(true);
    expect(archived[0].sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(() => db().prepare("DELETE FROM properties WHERE id = ?").run(id)).toThrow(/never deleted/);
    expect(() => db().prepare("DELETE FROM files").run()).toThrow(/never deleted/);
    expect(() => db().prepare("DELETE FROM audit_log").run()).toThrow(/never deleted/);
    await upload(re, id, "property_media");
    submitProperty(re, id);
    pipeline.decide(em, id, "approved", "ok go");
    expect(() => db().prepare("UPDATE decisions SET remarks = 'x'").run()).toThrow(/never changed/);
  });

  it("rejects files whose contents don't match their type", async () => {
    const id = createProperty(re, INPUT);
    await expect(
      saveUpload(re, id, {
        category: "property_media",
        ownerId: null,
        mime: "image/png",
        originalName: "evil.png",
        declaredSize: 20,
        body: new Blob(["<script>alert(1)</script>"]).stream(),
      }),
    ).rejects.toThrow(/don't match/);
    await expect(upload(re, id, "property_media", { pdf: true })).rejects.toThrow(/Only JPEG/);
  });

  it("writes a verifiable database backup", async () => {
    const id = await submitted();
    const b = await runBackup("manual");
    expect(b.error).toBeNull();
    expect(b.sizeBytes).toBeGreaterThan(0);
    expect(listBackups()[0].id).toBe(b.id);
    const { DatabaseSync } = await import("node:sqlite");
    const copy = new DatabaseSync(path.join(dataDir, "backups", b.fileName));
    expect((copy.prepare("SELECT store_name FROM properties WHERE id = ?").get(id) as { store_name: string }).store_name).toBe(INPUT.storeName);
    copy.close();
  });
});

describe("access management", () => {
  it("invites a user who sets a password and signs in", async () => {
    const { user, link } = inviteUser(admin, { email: "New.Person@Example.com", name: "New Person", role: "finance" });
    await redeemToken(link.url.split("/invite/")[1], "correct horse 42");
    expect((await authenticate("new.person@example.com", "correct horse 42")).role).toBe("finance");
    expect(user.status).toBe("invited");
  });

  it("keeps at least one admin and blocks disabled users", async () => {
    expect(() => changeRole(admin, admin.id, "sales")).toThrow(/own role/);
    const { user, link } = inviteUser(admin, { email: "d@example.com", name: "D", role: "sales" });
    await redeemToken(link.url.split("/invite/")[1], "good password 1");
    setUserEnabled(admin, user.id, false);
    await expect(authenticate(user.email, "good password 1")).rejects.toThrow(/disabled/);
  });
});

describe("form validation", () => {
  const form = (o: Record<string, string> = {}) =>
    new Map(
      Object.entries({
        storeName: "X", address: "Y", mapUrl: "28.61, 77.20", totalAreaSqft: "5,400", carpetAreaSqft: "5000",
        askingRent: "100000", securityDeposit: "300000", advanceRent: "100000", lockInMonths: "12",
        structureType: "shed", structureHeightFt: "20", rentFreeDays: "15", handoverDate: "2026-12-01", ...o,
      }),
    );

  it("accepts a complete property form", () => {
    const r = parsePropertyInput(form());
    expect(r.ok && r.value).toMatchObject({ totalAreaSqft: 5400, structureType: "shed", leaseTenureMonths: null, latitude: 28.61 });
  });

  it("reports invalid property fields", () => {
    const r = parsePropertyInput(form({ carpetAreaSqft: "6000", structureType: "brick", mapUrl: "javascript:alert(1)" }));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["carpetAreaSqft", "mapUrl", "structureType"]);
  });

  it("validates owner KYC and bank formats", () => {
    const r = parseOwnerInput(new Map(Object.entries({ name: "A", panNumber: "abc", bankAccountNumber: "12", isOrganisation: "on" })));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["bankAccountName", "bankAccountNumber", "bankIfsc", "bankName", "gstNumber", "panNumber"]);
  });
});
