import { formatDate, formatINR, formatMonths, formatNumber } from "@/lib/expansion/format";
import type { Role } from "@/lib/expansion/roles";
import type { PropertyView } from "@/lib/expansion/types";
import { visibilityFor, type PropertyField } from "@/lib/expansion/workflow";

// The order facts appear in, and how each is displayed. Only fields the
// viewer's role may see are rendered (the server has already blanked the
// rest, this just avoids showing empty rows).
const FACTS: { field: PropertyField; label: string; render: (p: PropertyView) => string }[] = [
  { field: "areaSqft", label: "Area", render: (p) => formatNumber(p.areaSqft, " sq ft") },
  { field: "rentPerMonth", label: "Rent / month", render: (p) => formatINR(p.rentPerMonth) },
  { field: "securityDeposit", label: "Security deposit", render: (p) => formatINR(p.securityDeposit) },
  { field: "advanceRent", label: "Advance rent", render: (p) => formatINR(p.advanceRent) },
  { field: "rentFreeDays", label: "Rent-free days", render: (p) => formatNumber(p.rentFreeDays, " days") },
  { field: "leaseTenureMonths", label: "Lease tenure", render: (p) => formatMonths(p.leaseTenureMonths) },
  { field: "lockInMonths", label: "Lock-in period", render: (p) => formatMonths(p.lockInMonths) },
  { field: "rentEscalationPct", label: "Rent escalation", render: (p) => formatNumber(p.rentEscalationPct, "% per year") },
  { field: "handoverDate", label: "Handover date", render: (p) => formatDate(p.handoverDate) },
  { field: "ownerName", label: "Property owner", render: (p) => p.ownerName ?? "—" },
];

export default function PropertyFacts({ property, role }: { property: PropertyView; role: Role }) {
  const { fields } = visibilityFor(role);
  const facts = FACTS.filter((f) => fields.has(f.field));
  const perSqft =
    fields.has("rentPerMonth") && property.rentPerMonth && property.areaSqft
      ? property.rentPerMonth / property.areaSqft
      : null;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.field}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{f.label}</dt>
            <dd className="mt-0.5 text-base font-medium text-zinc-900 dark:text-zinc-100">{f.render(property)}</dd>
          </div>
        ))}
        {perSqft !== null ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Rent / sq ft / month</dt>
            <dd className="mt-0.5 text-base font-medium text-zinc-900 dark:text-zinc-100">₹{perSqft.toFixed(2)}</dd>
          </div>
        ) : null}
      </dl>
      {fields.has("notes") && property.notes ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Notes</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{property.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
