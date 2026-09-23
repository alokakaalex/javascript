import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/portal/AuthForms";
import { Card, PageHeader } from "@/components/portal/ui";
import { ROLE_INFO } from "@/lib/expansion/roles";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Account" subtitle={`${user.name} · ${user.email}`} />
      <Card title="Your role">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">{ROLE_INFO[user.role].label}</p>
        <p className="mt-1 text-sm text-zinc-500">{ROLE_INFO[user.role].description}</p>
        <p className="mt-2 text-xs text-zinc-500">Roles are assigned by your access manager.</p>
      </Card>
      <Card title="Change password">
        <ChangePasswordForm />
      </Card>
    </>
  );
}
