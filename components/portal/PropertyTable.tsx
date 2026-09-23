import Link from "next/link";
import { formatDate, formatINR, formatNumber } from "@/lib/expansion/format";
import type { Role } from "@/lib/expansion/roles";
import type { PropertyView } from "@/lib/expansion/types";
import { pendingStage, STAGE_LABEL, STAGES, visibilityFor, visibleDecisionStages, type Stage } from "@/lib/expansion/workflow";
import { EmptyState, StatusBadge } from "./ui";

function StageChip({ property, stage }: { property: PropertyView; stage: Stage }) {
  const d = property.decisions.find((x) => x.round === property.round && x.stage === stage);
  const pending = pendingStage(property.status) === stage;
  const [text, tone] = d
    ? d.decision === "approved"
      ? ["✓ Approved", "text-emerald-700 dark:text-emerald-400"]
      : ["✕ Passed", "text-rose-700 dark:text-rose-400"]
    : pending
      ? ["● Pending", "text-amber-700 dark:text-amber-400"]
      : ["—", "text-zinc-400"];
  return (
    <span className={`whitespace-nowrap text-xs font-medium ${tone}`} title={d ? `${d.decidedByName}: ${d.remarks}` : undefined}>
      {text}
    </span>
  );
}

export default function PropertyTable({
  properties,
  role,
  hrefBase,
  empty,
}: {
  properties: PropertyView[];
  role: Role;
  hrefBase: string;
  empty: string;
}) {
  if (properties.length === 0) return <EmptyState>{empty}</EmptyState>;
  const { fields } = visibilityFor(role);
  const stages = visibleDecisionStages(role);
  // Reviewers see their own and earlier teams' outcomes, not the overall
  // status (which would reveal later teams' decisions).
  const reviewer = role !== "admin" && role !== "real_estate";
  const showStages = reviewer ? stages : STAGES;
  const money: { key: "rentPerMonth" | "securityDeposit" | "advanceRent"; label: string }[] = [
    { key: "rentPerMonth" as const, label: "Rent / mo" },
    { key: "securityDeposit" as const, label: "Deposit" },
    { key: "advanceRent" as const, label: "Advance" },
  ].filter((c) => fields.has(c.key));
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500";
  const td = "px-3 py-3 align-top";

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th className={th}>Property</th>
            {role === "admin" ? <th className={th}>Submitted by</th> : null}
            <th className={`${th} text-right`}>Area</th>
            {money.map((c) => (
              <th key={c.key} className={`${th} text-right`}>
                {c.label}
              </th>
            ))}
            {fields.has("rentFreeDays") ? <th className={`${th} text-right`}>Rent-free</th> : null}
            {showStages.map((s) => (
              <th key={s} className={th}>
                {STAGE_LABEL[s]}
              </th>
            ))}
            {reviewer ? null : <th className={th}>Status</th>}
            <th className={th}>Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {properties.map((p) => (
            <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <td className={td}>
                <Link href={`${hrefBase}/${p.id}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                  {p.title}
                </Link>
                <div className="text-xs text-zinc-500">
                  {p.code}
                  {p.round > 1 ? ` · round ${p.round}` : ""} · <span className="line-clamp-1 inline">{p.address}</span>
                </div>
              </td>
              {role === "admin" ? <td className={`${td} whitespace-nowrap text-zinc-700 dark:text-zinc-300`}>{p.createdByName}</td> : null}
              <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatNumber(p.areaSqft, " sq ft")}</td>
              {money.map((c) => (
                <td key={c.key} className={`${td} whitespace-nowrap text-right tabular-nums`}>
                  {formatINR(p[c.key])}
                </td>
              ))}
              {fields.has("rentFreeDays") ? (
                <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatNumber(p.rentFreeDays, " d")}</td>
              ) : null}
              {showStages.map((s) => (
                <td key={s} className={td}>
                  <StageChip property={p} stage={s} />
                </td>
              ))}
              {reviewer ? null : (
                <td className={td}>
                  <StatusBadge status={p.status} />
                </td>
              )}
              <td className={`${td} whitespace-nowrap text-zinc-500`}>{formatDate(p.submittedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
