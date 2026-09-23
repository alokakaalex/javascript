// Parses and validates the property form. Pure, so the same rules are unit
// tested and enforced on the server regardless of what the browser sent.

import { parseCoordinates, safeHttpUrl } from "./maps";

export interface PropertyInput {
  title: string;
  address: string;
  mapUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  ownerName: string;
  areaSqft: number;
  rentPerMonth: number;
  securityDeposit: number;
  advanceRent: number;
  leaseTenureMonths: number;
  rentEscalationPct: number;
  rentFreeDays: number;
  handoverDate: string;
  lockInMonths: number;
  notes: string;
}

export type FieldErrors = Partial<Record<keyof PropertyInput, string>>;

export type ParseResult =
  | { ok: true; value: PropertyInput }
  | { ok: false; errors: FieldErrors };

type Source = { get(name: string): unknown };

function text(src: Source, name: string): string {
  const v = src.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function parsePropertyInput(src: Source): ParseResult {
  const errors: FieldErrors = {};

  const str = (name: keyof PropertyInput, label: string, max: number, required = true) => {
    const v = text(src, name);
    if (required && !v) errors[name] = `${label} is required.`;
    else if (v.length > max) errors[name] = `${label} must be at most ${max} characters.`;
    return v;
  };

  const number = (
    name: keyof PropertyInput,
    label: string,
    opts: { min?: number; max?: number; integer?: boolean; positive?: boolean } = {},
  ) => {
    const raw = text(src, name).replace(/,/g, "");
    if (!raw) {
      errors[name] = `${label} is required.`;
      return 0;
    }
    const v = Number(raw);
    const { min = 0, max = 1e12, integer = false, positive = false } = opts;
    if (!Number.isFinite(v)) errors[name] = `${label} must be a number.`;
    else if (integer && !Number.isInteger(v)) errors[name] = `${label} must be a whole number.`;
    else if (positive && v <= 0) errors[name] = `${label} must be greater than 0.`;
    else if (v < min) errors[name] = `${label} can't be less than ${min}.`;
    else if (v > max) errors[name] = `${label} can't be more than ${max}.`;
    return v;
  };

  const title = str("title", "Property name", 150);
  const address = str("address", "Address", 500);
  const ownerName = str("ownerName", "Property owner name", 150);
  const notes = str("notes", "Notes", 5000, false);

  const mapRaw = text(src, "mapUrl");
  let mapUrl: string | null = null;
  let coords = null;
  if (!mapRaw) {
    errors.mapUrl = "Google Maps location is required.";
  } else if (mapRaw.length > 2000) {
    errors.mapUrl = "Map link is too long.";
  } else {
    coords = parseCoordinates(mapRaw);
    mapUrl = safeHttpUrl(mapRaw);
    if (!mapUrl && !coords) {
      errors.mapUrl = "Paste a Google Maps link (https://…) or coordinates like 28.6139, 77.2090.";
    }
  }

  const areaSqft = number("areaSqft", "Area", { positive: true, max: 10_000_000 });
  const rentPerMonth = number("rentPerMonth", "Rent per month", { positive: true });
  const securityDeposit = number("securityDeposit", "Security deposit");
  const advanceRent = number("advanceRent", "Advance rent");
  const leaseTenureMonths = number("leaseTenureMonths", "Lease tenure", { integer: true, positive: true, max: 1200 });
  const rentEscalationPct = number("rentEscalationPct", "Rent escalation", { max: 100 });
  const rentFreeDays = number("rentFreeDays", "Rent-free days", { integer: true, max: 3650 });
  const lockInMonths = number("lockInMonths", "Lock-in period", { integer: true, max: 1200 });

  const handoverDate = text(src, "handoverDate");
  if (!handoverDate) errors.handoverDate = "Handover date is required.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(handoverDate) || Number.isNaN(Date.parse(handoverDate))) {
    errors.handoverDate = "Enter a valid date.";
  }

  if (!errors.lockInMonths && !errors.leaseTenureMonths && lockInMonths > leaseTenureMonths) {
    errors.lockInMonths = "Lock-in period can't be longer than the lease tenure.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      address,
      mapUrl,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      ownerName,
      areaSqft,
      rentPerMonth,
      securityDeposit,
      advanceRent,
      leaseTenureMonths,
      rentEscalationPct,
      rentFreeDays,
      handoverDate,
      lockInMonths,
      notes,
    },
  };
}
