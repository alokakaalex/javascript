import { beforeEach, describe, expect, it } from "vitest";
import { parsePropertyInput, type PropertyInput } from "@/lib/expansion/propertyInput";
import type { Role } from "@/lib/expansion/roles";
import type { User } from "@/lib/expansion/types";
import { db, resetDbForTests } from "./db";
import { listNotifications, unreadCount } from "./notifications";
import {
  createProperty,
  decide,
  getProperty,
  insertMedia,
  listProperties,
  reviewQueue,
  submitProperty,
  updateProperty,
} from "./properties";
import { authenticate, changeRole, inspectToken, inviteUser, redeemToken, setUserEnabled } from "./users";

const INPUT: PropertyInput = {
  title: "Rohini Sector 7 warehouse",
  address: "Plot 12, Sector 7, Rohini, Delhi",
  mapUrl: "https://www.google.com/maps/@28.7041,77.1025,17z",
  latitude: 28.7041,
  longitude: 77.1025,
  ownerName: "R. K. Sharma",
  areaSqft: 6500,
  rentPerMonth: 185000,
  securityDeposit: 555000,
  advanceRent: 185000,
  leaseTenureMonths: 108,
  rentEscalationPct: 5,
  rentFreeDays: 30,
  handoverDate: "2026-11-01",
  lockInMonths: 36,
  notes: "Owner open to 45 rent-free days.",
};

let seq = 0;
function makeUser(role: Role, name: string = role): User {
  const id = `user-${++seq}`;
  db()
    .prepare(
      "INSERT INTO users (id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
    )
    .run(id, `${id}@example.com`, name, role, new Date().toISOString());
  return { id, email: `${id}@example.com`, name, role, status: "active", lastLoginAt: null, createdAt: "" };
}

function addPhoto(user: User, propertyId: number) {
  insertMedia(user, propertyId, {
    id: crypto.randomUUID(),
    kind: "image",
    mime: "image/jpeg",
    originalName: "front.jpg",
    sizeBytes: 1000,
  });
}

let admin: User, re: User, sales: User, ops: User, business: User;

beforeEach(() => {
  resetDbForTests();
  admin = makeUser("admin", "Asha Admin");
  re = makeUser("real_estate", "Ravi RE");
  sales = makeUser("sales", "Sonal Sales");
  ops = makeUser("ops", "Om Ops");
  business = makeUser("business", "Bina Business");
});

function submitted(): number {
  const id = createProperty(re, INPUT);
  addPhoto(re, id);
  submitProperty(re, id);
  return id;
}

describe("approval pipeline", () => {
  it("moves sales → ops → business → approved and notifies at each step", () => {
    const id = submitted();
    expect(getProperty(admin, id)?.status).toBe("pending_sales");
    expect(unreadCount(sales.id)).toBe(1);
    // Ops and business can't see it yet.
    expect(getProperty(ops, id)).toBeNull();
    expect(getProperty(business, id)).toBeNull();

    decide(sales, id, "approved", "Strong catchment, 3 competitors within 2 km");
    expect(getProperty(admin, id)?.status).toBe("pending_ops");
    expect(listNotifications(re.id)[0].title).toMatch(/Sales & Category approved/);
    expect(listNotifications(ops.id)[0].title).toMatch(/Awaiting your review/);

    decide(ops, id, "approved", "Deposit acceptable");
    expect(getProperty(admin, id)?.status).toBe("pending_business");
    expect(listNotifications(business.id)[0].body).toMatch(/Sales & Category and Ops approved/);

    decide(business, id, "approved", "Go ahead");
    const final = getProperty(admin, id)!;
    expect(final.status).toBe("approved");
    expect(final.decisions.map((d) => [d.stage, d.decision])).toEqual([
      ["sales", "approved"],
      ["ops", "approved"],
      ["business", "approved"],
    ]);
    expect(listNotifications(re.id)[0].body).toMatch(/All three teams have now approved/);
    expect(unreadCount(re.id)).toBe(3);
  });

  it("stops at a pass, notifies the uploader, and allows revise-and-resubmit", () => {
    const id = submitted();
    decide(sales, id, "passed", "Too far from our customer cluster");
    expect(getProperty(re, id)?.status).toBe("passed_sales");
    expect(listNotifications(re.id)[0].title).toMatch(/Sales & Category passed/);
    expect(unreadCount(ops.id)).toBe(0);

    updateProperty(re, id, { ...INPUT, rentPerMonth: 170000 });
    submitProperty(re, id);
    const p = getProperty(admin, id)!;
    expect(p.status).toBe("pending_sales");
    expect(p.round).toBe(2);
    decide(sales, id, "approved", "Revised rent works");
    expect(getProperty(admin, id)?.decisions).toHaveLength(2);
  });

  it("requires remarks and the right team, and rejects double decisions", () => {
    const id = submitted();
    expect(() => decide(sales, id, "approved", "  ")).toThrow(/Remarks are required/);
    expect(() => decide(ops, id, "approved", "ok ok")).toThrow(/not found|no longer waiting/);
    expect(() => decide(re, id, "approved", "ok ok")).toThrow(/Only review teams/);
    decide(sales, id, "approved", "Looks good");
    expect(() => decide(sales, id, "passed", "Changed my mind")).toThrow(/no longer waiting/);
  });

  it("locks the property while in review and requires media to submit", () => {
    const id = createProperty(re, INPUT);
    expect(() => submitProperty(re, id)).toThrow(/at least one photo or video/);
    addPhoto(re, id);
    submitProperty(re, id);
    expect(() => updateProperty(re, id, INPUT)).toThrow(/under review/);
    const other = makeUser("real_estate", "Other RE");
    expect(getProperty(other, id)).toBeNull();
    expect(() => createProperty(sales, INPUT)).toThrow(/Only real estate managers/);
  });
});

describe("what each team can see", () => {
  it("shows sales only media, location and area", () => {
    const id = submitted();
    const p = getProperty(sales, id)!;
    expect(p.areaSqft).toBe(6500);
    expect(p.address).toBe(INPUT.address);
    expect(p.mediaVisible).toBe(true);
    expect(p.media).toHaveLength(1);
    for (const hidden of [
      p.ownerName,
      p.rentPerMonth,
      p.securityDeposit,
      p.advanceRent,
      p.leaseTenureMonths,
      p.rentEscalationPct,
      p.rentFreeDays,
      p.handoverDate,
      p.lockInMonths,
      p.notes,
    ]) {
      expect(hidden).toBeNull();
    }
  });

  it("shows ops area, location, advance, deposit and rent-free days — no media", () => {
    const id = submitted();
    decide(sales, id, "approved", "Good market");
    const p = getProperty(ops, id)!;
    expect([p.areaSqft, p.advanceRent, p.securityDeposit, p.rentFreeDays]).toEqual([6500, 185000, 555000, 30]);
    expect(p.rentPerMonth).toBeNull();
    expect(p.ownerName).toBeNull();
    expect(p.mediaVisible).toBe(false);
    expect(p.media).toEqual([]);
    expect(p.decisions.map((d) => d.stage)).toEqual(["sales"]);
  });

  it("shows business rent, deposit, advance, rent-free days and media, plus both earlier decisions", () => {
    const id = submitted();
    decide(sales, id, "approved", "Good market");
    decide(ops, id, "approved", "Fine");
    const p = getProperty(business, id)!;
    expect([p.rentPerMonth, p.securityDeposit, p.advanceRent, p.rentFreeDays]).toEqual([185000, 555000, 185000, 30]);
    expect(p.media).toHaveLength(1);
    expect(p.leaseTenureMonths).toBeNull();
    expect(p.lockInMonths).toBeNull();
    expect(p.decisions.map((d) => d.stage)).toEqual(["sales", "ops"]);
  });

  it("hides later-stage decisions from earlier reviewers", () => {
    const id = submitted();
    decide(sales, id, "approved", "Good market");
    decide(ops, id, "passed", "Deposit too high");
    expect(getProperty(sales, id)!.decisions.map((d) => d.stage)).toEqual(["sales"]);
    expect(getProperty(re, id)!.decisions.map((d) => d.stage)).toEqual(["sales", "ops"]);
  });

  it("gives admins everything, including drafts", () => {
    const draft = createProperty(re, INPUT);
    const p = getProperty(admin, draft)!;
    expect(p.ownerName).toBe(INPUT.ownerName);
    expect(p.lockInMonths).toBe(36);
    expect(listProperties(admin)).toHaveLength(1);
    expect(listProperties(sales)).toHaveLength(0);
  });

  it("splits the review queue into pending and reviewed", () => {
    const a = submitted();
    const b = submitted();
    decide(sales, a, "approved", "ok go");
    const q = reviewQueue(sales);
    expect(q.pending.map((p) => p.id)).toEqual([b]);
    expect(q.reviewed.map((p) => p.id)).toEqual([a]);
  });
});

describe("access management", () => {
  it("invites a user who sets a password and can then sign in", async () => {
    const { user, link } = inviteUser(admin, { email: "New.Person@Example.com", name: "New Person", role: "ops" });
    expect(user.status).toBe("invited");
    expect(user.email).toBe("new.person@example.com");
    const token = link.url.split("/invite/")[1];
    expect(inspectToken(token)?.user.id).toBe(user.id);
    await expect(authenticate(user.email, "whatever123")).rejects.toThrow(/invite link/);

    await redeemToken(token, "correct horse 42");
    expect(inspectToken(token)).toBeNull();
    await expect(redeemToken(token, "another pass 42")).rejects.toThrow(/invalid or has expired/);
    expect((await authenticate("NEW.person@example.com", "correct horse 42")).role).toBe("ops");
    await expect(authenticate(user.email, "wrong password 1")).rejects.toThrow(/Incorrect/);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    inviteUser(admin, { email: "a@example.com", name: "A", role: "sales" });
    expect(() => inviteUser(admin, { email: "A@example.com", name: "A2", role: "ops" })).toThrow(/already has an account/);
    const { link } = inviteUser(admin, { email: "b@example.com", name: "B", role: "sales" });
    await expect(redeemToken(link.url.split("/invite/")[1], "short1")).rejects.toThrow(/at least 10/);
  });

  it("locks an account after repeated failed sign-ins", async () => {
    const { user, link } = inviteUser(admin, { email: "c@example.com", name: "C", role: "sales" });
    await redeemToken(link.url.split("/invite/")[1], "good password 1");
    for (let i = 0; i < 5; i++) await expect(authenticate(user.email, "bad password 1")).rejects.toThrow();
    await expect(authenticate(user.email, "good password 1")).rejects.toThrow(/Too many failed attempts/);
  });

  it("keeps at least one active admin and blocks disabled users", async () => {
    expect(() => changeRole(admin, admin.id, "sales")).toThrow(/own role/);
    expect(() => setUserEnabled(admin, admin.id, false)).toThrow(/own account/);
    const { user, link } = inviteUser(admin, { email: "d@example.com", name: "D", role: "sales" });
    await redeemToken(link.url.split("/invite/")[1], "good password 1");
    setUserEnabled(admin, user.id, false);
    await expect(authenticate(user.email, "good password 1")).rejects.toThrow(/disabled/);
    changeRole(admin, user.id, "business");
    setUserEnabled(admin, user.id, true);
    expect((await authenticate(user.email, "good password 1")).role).toBe("business");
  });
});

describe("property form validation", () => {
  const form = (overrides: Record<string, string> = {}) =>
    new Map(
      Object.entries({
        title: "X",
        address: "Y",
        mapUrl: "28.61, 77.20",
        ownerName: "Z",
        areaSqft: "5,400",
        rentPerMonth: "100000",
        securityDeposit: "300000",
        advanceRent: "0",
        leaseTenureMonths: "60",
        rentEscalationPct: "5",
        rentFreeDays: "15",
        handoverDate: "2026-12-01",
        lockInMonths: "12",
        ...overrides,
      }),
    );

  it("accepts a complete form and parses coordinates", () => {
    const r = parsePropertyInput(form());
    expect(r.ok && r.value).toMatchObject({ areaSqft: 5400, latitude: 28.61, longitude: 77.2, mapUrl: null });
  });

  it("reports each invalid field", () => {
    const r = parsePropertyInput(
      form({ areaSqft: "0", mapUrl: "javascript:alert(1)", lockInMonths: "120", handoverDate: "soon" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["areaSqft", "handoverDate", "lockInMonths", "mapUrl"]);
  });
});
