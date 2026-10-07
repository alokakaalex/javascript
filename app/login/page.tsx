import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/portal/AuthForms";
import AuthFrame from "@/components/portal/AuthFrame";
import { Alert } from "@/components/portal/ui";
import { ROLE_INFO } from "@/lib/expansion/roles";
import { currentUser } from "@/lib/server/session";
import { countUsers } from "@/lib/server/users";
import { demoLogin } from "@/app/actions/auth";
import { config } from "@/lib/server/config";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/server/demo";

function DemoAccounts() {
  return (
    <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <div>
        <p className="text-sm font-semibold text-navy-900">Demo — sign in as any role</p>
        <p className="text-xs text-navy-700">
          Every account&apos;s password is <code className="font-mono">{DEMO_PASSWORD}</code>. Sample data resets from time to time.
        </p>
      </div>
      <div className="grid gap-2">
        {DEMO_USERS.map((u) => (
          <form key={u.id} action={demoLogin}>
            <input type="hidden" name="userId" value={u.id} />
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-xl border border-brand-100 bg-white px-3 py-2 text-left text-sm transition hover:border-brand-400 hover:shadow-sm"
            >
              <span className="font-semibold text-navy-900">{u.name}</span>
              <span className="text-xs text-slate-500">{u.email}</span>
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
  const noUsers = !config.demoMode && (await countUsers()) === 0;

  return (
    <AuthFrame>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-navy-950">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use the work email your access manager added.</p>
        </div>
        {noUsers ? (
          <Alert tone="warning">
            No accounts exist yet. Set <code>ADMIN_EMAIL</code> and <code>ADMIN_INITIAL_PASSWORD</code> in the server environment and restart to
            create the first access manager.
          </Alert>
        ) : null}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_-12px_rgba(48,51,68,0.25)]">
          <LoginForm />
        </div>
        {config.demoMode ? <DemoAccounts /> : null}
        <p className="text-xs text-slate-500">Forgot your password or need access? Ask your access manager for a new link.</p>
      </div>
    </AuthFrame>
  );
}
