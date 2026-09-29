import type { Metadata } from "next";
import { SystemPanel } from "@/components/portal/SystemForms";
import { Alert, Card, PageHeader } from "@/components/portal/ui";
import { formatBytes, formatDateTime } from "@/lib/expansion/format";
import { backupIsStale, listBackups, storageStatus } from "@/lib/server/backups";
import { emailEnabled } from "@/lib/server/mailer";
import { requireRole } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { salesApproverCount } from "@/lib/server/users";

export const metadata: Metadata = { title: "Backups & settings" };

export default async function SystemPage() {
  await requireRole("admin");
  const s = storageStatus();
  const backups = listBackups(30);
  const settings = getSettings();
  const last = backups[0];
  const stale = backupIsStale();

  return (
    <>
      <PageHeader title="Backups, storage & settings" subtitle="How the portal keeps every document and record safe." />

      {!s.remoteEnabled ? (
        <Alert tone="warning">
          <strong>Off-site copy is not configured.</strong> Files and backups are only on this server&apos;s disk. Set the
          <code> S3_*</code> variables (AWS S3, Cloudflare R2, Backblaze B2…) so a copy of every file and every backup
          is kept off the server. See the README.
        </Alert>
      ) : s.pendingRemote ? (
        <Alert tone="warning">{s.pendingRemote} file(s) haven&apos;t reached the bucket yet; they&apos;re retried with every backup.</Alert>
      ) : null}
      {stale ? <Alert tone="error">No successful backup in the last {s.intervalHours * 2} hours. Check the server logs, or run one now.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Stored files">
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{s.files}</p>
          <p className="text-sm text-zinc-500">{formatBytes(s.bytes)} total · never deleted</p>
          <p className="mt-2 text-xs text-zinc-500">Off-site bucket: {s.bucket ?? "not configured"}</p>
        </Card>
        <Card title="Database backups">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Every {s.intervalHours} hours to <code className="text-xs">{s.backupsDir}</code>
            {s.remoteEnabled ? " and the bucket" : ""}.
          </p>
          <p className="mt-1 text-sm text-zinc-500">Last: {last ? `${formatDateTime(last.createdAt)}${last.error ? " (with errors)" : ""}` : "never"}</p>
        </Card>
        <Card title="Email">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {emailEnabled() ? "SMTP configured: invites, notifications and LOIs are emailed." : "Not configured: notifications are in-app only and LOIs must be sent manually."}
          </p>
        </Card>
      </div>

      <SystemPanel settings={settings} approvers={salesApproverCount()} />

      <Card title="Recent backups">
        {backups.length === 0 ? (
          <p className="text-sm text-zinc-500">No backups yet.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-1 pr-4">When</th>
                <th className="py-1 pr-4">File</th>
                <th className="py-1 pr-4">Size</th>
                <th className="py-1 pr-4">Off-site</th>
                <th className="py-1 pr-4">Trigger</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-t border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5 pr-4 whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
                  <td className="py-1.5 pr-4 font-mono text-xs">{b.fileName}</td>
                  <td className="py-1.5 pr-4">{formatBytes(b.sizeBytes)}</td>
                  <td className="py-1.5 pr-4">{b.remoteCopy ? "✓" : "—"}</td>
                  <td className="py-1.5 pr-4">{b.trigger}</td>
                  <td className={`py-1.5 ${b.error ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400"}`}>{b.error ?? "OK"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
