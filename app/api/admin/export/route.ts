import { STAGES, STATUS_LABEL } from "@/lib/expansion/workflow";
import { listProperties } from "@/lib/server/properties";
import { currentUser } from "@/lib/server/session";

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  // Prefix formula-looking values so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const header = [
    "Code", "Status", "Round", "Property", "Address", "Map link", "Latitude", "Longitude", "Owner",
    "Area (sq ft)", "Rent / month", "Security deposit", "Advance rent", "Lease tenure (months)",
    "Rent escalation % / yr", "Rent-free days", "Handover date", "Lock-in (months)", "Media files",
    "Submitted by", "Submitted at",
    ...STAGES.flatMap((s) => [`${s} decision`, `${s} remarks`, `${s} by`, `${s} at`]),
  ];
  const rows = listProperties(user).map((p) => {
    const current = (stage: string) => p.decisions.find((d) => d.round === p.round && d.stage === stage);
    return [
      p.code, STATUS_LABEL[p.status], p.round, p.title, p.address, p.mapUrl, p.latitude, p.longitude, p.ownerName,
      p.areaSqft, p.rentPerMonth, p.securityDeposit, p.advanceRent, p.leaseTenureMonths,
      p.rentEscalationPct, p.rentFreeDays, p.handoverDate, p.lockInMonths, p.media.length,
      p.createdByName, p.submittedAt,
      ...STAGES.flatMap((s) => {
        const d = current(s);
        return [d?.decision, d?.remarks, d?.decidedByName, d?.decidedAt];
      }),
    ];
  });
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expansion-properties-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
