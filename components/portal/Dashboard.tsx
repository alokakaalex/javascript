import Link from "next/link";
import { formatINR, formatNumber } from "@/lib/expansion/format";
import type { User } from "@/lib/expansion/types";
import { isStage, STAGE_INFO, STAGES, type PropertyState } from "@/lib/expansion/workflow";
import { actionQueue, dashboardStats, listProperties, type ListFilter } from "@/lib/server/properties";
import PropertyTable from "./PropertyTable";
import { buttonClass, inputClass, PageHeader } from "./ui";

const STATES: PropertyState[] = ["active", "on_hold", "rejected", "completed", "draft"];
const STATE_LABEL: Record<PropertyState, string> = {
  active: "In progress",
  on_hold: "On hold",
  rejected: "Rejected",
  completed: "Completed",
  draft: "Drafts",
};

function Stat({ label, value, sub, href }: { label: string; value: number | string; sub?: string; href?: string }) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </>
  );
  const cls = "rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";
  return href ? (
    <Link href={href} className={`${cls} hover:border-zinc-400 dark:hover:border-zinc-600`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The complete view for the expansion manager, founder and access manager. */
export default function Dashboard({
  user,
  basePath,
  title,
  subtitle,
  params,
}: {
  user: User;
  basePath: string;
  title: string;
  subtitle: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const stage = one("stage");
  const state = one("state") as PropertyState;
  const q = one("q");
  const filter: ListFilter = isStage(stage)
    ? { kind: "stage", stage }
    : STATES.includes(state)
      ? { kind: "state", state }
      : { kind: "all" };
  const properties = listProperties(user, filter, q);
  const stats = dashboardStats();
  const mine = actionQueue(user);
  const href = (extra: Record<string, string>) => `${basePath}?${new URLSearchParams({ ...extra, ...(q ? { q } : {}) })}`;
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1 text-sm ${
      active ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
    }`;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <a href="/api/admin/export" className={buttonClass.secondary}>
            Export CSV
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="All properties" value={stats.total} sub={`${stats.byState.draft ?? 0} drafts`} href={basePath} />
        <Stat label="In progress" value={(stats.byState.active ?? 0) + (stats.byState.on_hold ?? 0)} sub={`${stats.byState.on_hold ?? 0} on hold`} href={href({ state: "active" })} />
        <Stat label="Completed" value={stats.byState.completed ?? 0} sub={formatNumber(stats.completedArea, " sq ft")} href={href({ state: "completed" })} />
        <Stat label="Rejected" value={stats.byState.rejected ?? 0} href={href({ state: "rejected" })} />
        <Stat label="Paid out" value={formatINR(stats.paid.token + stats.paid.balance + stats.paid.stamp_duty)} sub={`Token ${formatINR(stats.paid.token)} · Balance ${formatINR(stats.paid.balance)}`} />
        <Stat label="Stamp duty" value={formatINR(stats.paid.stamp_duty)} sub={`${stats.stampDutyRequested} request(s) pending`} />
      </div>

      {mine.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Needs your action ({mine.length})</h2>
          <PropertyTable properties={mine} role={user.role} empty="" />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Where every property is</h2>
        <div className="flex flex-wrap gap-1">
          <Link href={basePath} className={chip(filter.kind === "all")}>
            All
          </Link>
          {STAGES.map((s) => (
            <Link key={s} href={href({ stage: s })} className={chip(filter.kind === "stage" && filter.stage === s)}>
              {STAGE_INFO[s].label} <span className="opacity-60">{stats.byStage[s] ?? 0}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {STATES.map((s) => (
              <Link key={s} href={href({ state: s })} className={chip(filter.kind === "state" && filter.state === s)}>
                {STATE_LABEL[s]} <span className="opacity-60">{stats.byState[s] ?? 0}</span>
              </Link>
            ))}
          </div>
          <form className="flex gap-2" action={basePath}>
            {filter.kind === "stage" ? <input type="hidden" name="stage" value={stage} /> : null}
            {filter.kind === "state" ? <input type="hidden" name="state" value={state} /> : null}
            <input name="q" defaultValue={q} placeholder="Search name, address, scout, PR-0001" className={`${inputClass} w-72`} />
            <button type="submit" className={buttonClass.secondary}>
              Search
            </button>
          </form>
        </div>
        <PropertyTable properties={properties} role={user.role} empty="No properties match." />
      </section>
    </>
  );
}
