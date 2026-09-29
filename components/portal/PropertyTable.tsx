import Link from "next/link";
import { formatDate, formatINR, formatNumber } from "@/lib/expansion/format";
import type { Role } from "@/lib/expansion/roles";
import type { PropertyView } from "@/lib/expansion/types";
import { FIELD_VISIBILITY } from "@/lib/expansion/workflow";
import { EmptyState, StatusBadge } from "./ui";

export default function PropertyTable({ properties, role, empty }: { properties: PropertyView[]; role: Role; empty: string }) {
  if (properties.length === 0) return <EmptyState>{empty}</EmptyState>;
  const fields = FIELD_VISIBILITY[role];
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500";
  const td = "px-3 py-3 align-top";
  const money = (["askingRent", "securityDeposit", "advanceRent"] as const).filter((k) => fields.has(k));
  const moneyLabel = { askingRent: "Rent / mo", securityDeposit: "Deposit", advanceRent: "Advance" };
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th className={th}>Property</th>
            <th className={th}>Status</th>
            <th className={`${th} text-right`}>Area</th>
            {money.map((k) => (
              <th key={k} className={`${th} text-right`}>
                {moneyLabel[k]}
              </th>
            ))}
            <th className={th}>Scouted by</th>
            <th className={th}>Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {properties.map((p) => (
            <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <td className={td}>
                <Link href={`/properties/${p.id}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                  {p.storeName}
                </Link>
                <div className="text-xs text-zinc-500">
                  {p.code}
                  {p.round > 1 ? ` · round ${p.round}` : ""}
                  {p.address ? ` · ${p.address}` : ""}
                </div>
              </td>
              <td className={td}>
                <StatusBadge state={p.state} stage={p.stage} />
              </td>
              <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatNumber(p.totalAreaSqft, " sq ft")}</td>
              {money.map((k) => (
                <td key={k} className={`${td} whitespace-nowrap text-right tabular-nums`}>
                  {formatINR(p[k])}
                </td>
              ))}
              <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{p.createdByName}</td>
              <td className={`${td} whitespace-nowrap text-zinc-500`}>{formatDate(p.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
