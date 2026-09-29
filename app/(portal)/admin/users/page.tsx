import type { Metadata } from "next";
import { AddUserForm, UserActions } from "@/components/portal/AccessForms";
import { Card, PageHeader } from "@/components/portal/ui";
import { formatDateTime } from "@/lib/expansion/format";
import { ROLE_INFO, ROLES } from "@/lib/expansion/roles";
import { accessAudit } from "@/lib/server/audit";
import { emailEnabled } from "@/lib/server/mailer";
import { requireRole } from "@/lib/server/session";
import { listUsers } from "@/lib/server/users";

export const metadata: Metadata = { title: "Access & roles" };

const STATUS_TONE = {
  active: "text-emerald-700 dark:text-emerald-400",
  invited: "text-amber-700 dark:text-amber-400",
  disabled: "text-zinc-400",
};

const ACTION_LABEL: Record<string, string> = {
  "user.invited": "Invited",
  "user.invite_resent": "New invite link for",
  "user.reset_link": "Password reset link for",
  "user.activated": "Accepted invite",
  "user.password_reset": "Reset password",
  "user.password_changed": "Changed password",
  "user.role_changed": "Changed role of",
  "user.disabled": "Disabled",
  "user.enabled": "Re-enabled",
  "user.locked": "Locked after failed sign-ins:",
};

export default async function UsersPage() {
  const admin = await requireRole("admin");
  const users = listUsers();
  const log = accessAudit(50);

  return (
    <>
      <PageHeader
        title="Access & roles"
        subtitle="Add people by email and assign a role. Each person lands on their role's portal when they sign in."
      />

      <Card title="Add a person">
        <AddUserForm />
        <p className="mt-3 text-xs text-zinc-500">
          {emailEnabled()
            ? "The invite link is emailed to them and also shown here."
            : "Email isn't configured (SMTP_HOST), so copy the invite link shown after adding and send it to them."}{" "}
          Links expire after 7 days and work once.
        </p>
      </Card>

      <Card title="Roles">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="font-medium text-zinc-900 dark:text-zinc-100">
                {ROLE_INFO[r].label} <span className="text-zinc-500">({users.filter((u) => u.role === r && u.status !== "disabled").length})</span>
              </dt>
              <dd className="mt-0.5 text-xs text-zinc-500">{ROLE_INFO[r].description}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={`People (${users.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last sign-in</th>
                <th className="px-3 py-2">Role &amp; access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {users.map((u) => (
                <tr key={u.id} className={u.status === "disabled" ? "opacity-60" : ""}>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{u.name}</div>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                  </td>
                  <td className={`px-3 py-3 align-top font-medium capitalize ${STATUS_TONE[u.status]}`}>{u.status}</td>
                  <td className="whitespace-nowrap px-3 py-3 align-top text-zinc-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                  <td className="px-3 py-3 align-top">
                    <UserActions user={u} isSelf={u.id === admin.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recent access changes">
        {log.length === 0 ? (
          <p className="text-sm text-zinc-500">No changes yet.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {log.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-2">
                <time className="w-44 shrink-0 text-zinc-500">{formatDateTime(h.createdAt)}</time>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{h.actorName ?? "System"}</span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {ACTION_LABEL[h.action] ?? h.action} {h.details}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
