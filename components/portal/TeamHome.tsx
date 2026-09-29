import { ROLE_INFO } from "@/lib/expansion/roles";
import type { User } from "@/lib/expansion/types";
import { actionQueue, listProperties } from "@/lib/server/properties";
import PropertyTable from "./PropertyTable";
import { Alert, PageHeader } from "./ui";

/** Portal home for the review and finance teams: what's waiting on them, then everything they can see. */
export default function TeamHome({ user, title, waitingLabel }: { user: User; title: string; waitingLabel: string }) {
  const waiting = actionQueue(user);
  const waitingIds = new Set(waiting.map((p) => p.id));
  const rest = listProperties(user).filter((p) => !waitingIds.has(p.id));
  return (
    <>
      <PageHeader title={title} subtitle={ROLE_INFO[user.role].description} />
      {waiting.length === 0 ? <Alert tone="info">Nothing is waiting on you right now. You&apos;ll be notified when something is.</Alert> : null}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {waitingLabel} ({waiting.length})
        </h2>
        <PropertyTable properties={waiting} role={user.role} empty="Nothing waiting." />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Everything else you have access to ({rest.length})</h2>
        <PropertyTable properties={rest} role={user.role} empty="Nothing yet." />
      </section>
    </>
  );
}
