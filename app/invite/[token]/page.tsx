import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/portal/AuthForms";
import { Alert } from "@/components/portal/ui";
import { ROLE_INFO } from "@/lib/expansion/roles";
import { inspectToken } from "@/lib/server/users";

export const metadata: Metadata = { title: "Set your password", referrer: "no-referrer" };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const link = inspectToken(token);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Expansion Portal</h1>
        {link ? (
          <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {link.purpose === "invite" ? "Welcome" : "Hi"}, <strong>{link.user.name}</strong>.
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {link.purpose === "invite"
                  ? `You've been given access as ${ROLE_INFO[link.user.role].label}. Choose a password for ${link.user.email}.`
                  : `Choose a new password for ${link.user.email}.`}
              </p>
            </div>
            <SetPasswordForm token={token} email={link.user.email} />
          </div>
        ) : (
          <Alert tone="error">
            This link is invalid, already used, or has expired. Ask your access manager for a new one, or{" "}
            <Link href="/login" className="underline">
              sign in
            </Link>
            .
          </Alert>
        )}
      </div>
    </main>
  );
}
