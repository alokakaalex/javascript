import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/portal/AuthForms";
import { Alert } from "@/components/portal/ui";
import { ROLE_INFO } from "@/lib/expansion/roles";
import { currentUser } from "@/lib/server/session";
import { countUsers } from "@/lib/server/users";
import { demoLogin } from "@/app/actions/auth";
import { config } from "@/lib/server/config";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/server/demo";

function DemoAccounts() {
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <div>
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Demo: sign in as any role</p>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Every account&apos;s password is <code className="font-mono">{DEMO_PASSWORD}</code>. Sample data resets from time to time.
        </p>
      </div>
      <div className="grid gap-2">
        {DEMO_USERS.map((u) => (
          <form key={u.id} action={demoLogin}>
            <input type="hidden" name="userId" value={u.id} />
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-sm hover:border-amber-400 dark:border-amber-900 dark:bg-zinc-900"
            >
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{u.name}</span>
              <span className="text-xs text-zinc-500">{u.email}</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(ROLE_INFO[user.role].portal);
  const noUsers = countUsers() === 0 && !config.demoMode;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className={`w-full space-y-6 ${config.demoMode ? "max-w-md" : "max-w-sm"}`}>
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
        {config.demoMode ? <DemoAccounts /> : null}
        <p className="text-center text-xs text-zinc-500">
          Forgot your password or need access? Ask your access manager for a new link.
        </p>
      </div>
    </main>
  );
}
