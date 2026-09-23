import type { Metadata } from "next";
import Link from "next/link";
import PropertyTable from "@/components/portal/PropertyTable";
import { buttonClass, inputClass, PageHeader } from "@/components/portal/ui";
import { formatNumber } from "@/lib/expansion/format";
import { STATUS_LABEL, type PropertyStatus } from "@/lib/expansion/workflow";
import { dashboardStats, listProperties, type PropertyFilter } from "@/lib/server/properties";
import { requireRole } from "@/lib/server/session";

export const metadata: Metadata = { title: "Dashboard" };

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "in_review", label: "In review" },
  { value: "pending_sales", label: STATUS_LABEL.pending_sales },
  { value: "pending_ops", label: STATUS_LABEL.pending_ops },
  { value: "pending_business", label: STATUS_LABEL.pending_business },
  { value: "approved", label: STATUS_LABEL.approved },
  { value: "passed", label: "Passed" },
  { value: "draft", label: "Drafts" },
];

function Stat({ label, value, sub, href }: { label: string; value: number | string; sub?: string; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </Link>
  );
}

export default async function AdminDashboard(props: PageProps<"/admin">) {
  const user = await requireRole("admin");
  const params = await props.searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const q = typeof params.q === "string" ? params.q : "";
  const valid = FILTERS.some((f) => f.value === status);
  const filter: PropertyFilter = { status: valid && status ? (status as PropertyStatus | "in_review" | "passed") : undefined, search: q };
  const properties = listProperties(user, filter);
  const stats = dashboardStats();
  const s = (k: PropertyStatus) => stats.byStatus[k] ?? 0;
  const passed = s("passed_sales") + s("passed_ops") + s("passed_business");

  return (
    <>
      <PageHeader
        title="Expansion dashboard"
        subtitle="Every property, its full details and media, and each team's decision."
        actions={
          <>
            <a href="/api/admin/export" className={buttonClass.secondary}>
              Export CSV
            </a>
            <Link href="/admin/users" className={buttonClass.primary}>
              Manage access
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submitted" value={stats.total - stats.drafts} sub={`${stats.drafts} drafts`} href="/admin" />
        <Stat label="Awaiting Sales" value={s("pending_sales")} href="/admin?status=pending_sales" />
        <Stat label="Awaiting Ops" value={s("pending_ops")} href="/admin?status=pending_ops" />
        <Stat label="Awaiting Business" value={s("pending_business")} href="/admin?status=pending_business" />
        <Stat label="Approved" value={s("approved")} sub={formatNumber(stats.approvedArea, " sq ft")} href="/admin?status=approved" />
        <Stat
          label="Passed"
          value={passed}
          sub={`Sales ${s("passed_sales")} · Ops ${s("passed_ops")} · Biz ${s("passed_business")}`}
          href="/admin?status=passed"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = (valid ? status : "") === f.value;
            const href = `/admin?${new URLSearchParams({ ...(f.value ? { status: f.value } : {}), ...(q ? { q } : {}) })}`;
            return (
              <Link
                key={f.value || "all"}
                href={href}
                className={`rounded-full px-3 py-1 text-sm ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
        <form className="flex gap-2" action="/admin">
          {valid && status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} placeholder="Search name, address, uploader, PR-0001" className={`${inputClass} w-72`} />
          <button type="submit" className={buttonClass.secondary}>
            Search
          </button>
        </form>
      </div>

      <PropertyTable properties={properties} role={user.role} hrefBase="/admin/properties" empty="No properties match." />
    </>
  );
}
