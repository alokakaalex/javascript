import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/portal/AuthForms";
import { Alert } from "@/components/portal/ui";
import { ROLE_INFO } from "@/lib/expansion/roles";
import { currentUser } from "@/lib/server/session";
import { countUsers } from "@/lib/server/users";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(ROLE_INFO[user.role].portal);
  const noUsers = countUsers() === 0;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Expansion Portal</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in with the email your access manager added.</p>
        </div>
        {noUsers ? (
          <Alert tone="warning">
            No accounts exist yet. Set <code>ADMIN_EMAIL</code> and <code>ADMIN_INITIAL_PASSWORD</code> in the
            server environment and restart to create the first access manager.
          </Alert>
        ) : null}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <LoginForm />
        </div>
        <p className="text-center text-xs text-zinc-500">
          Forgot your password or need access? Ask your access manager for a new link.
        </p>
      </div>
    </main>
  );
}
