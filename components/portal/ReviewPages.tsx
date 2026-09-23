import { notFound } from "next/navigation";
import { ROLE_INFO } from "@/lib/expansion/roles";
import { pendingStatus, STAGE_LABEL, STAGES, type Stage } from "@/lib/expansion/workflow";
import { getProperty, reviewQueue } from "@/lib/server/properties";
import { requireRole } from "@/lib/server/session";
import DecisionForm from "./DecisionForm";
import PropertyDetail from "./PropertyDetail";
import PropertyTable from "./PropertyTable";
import { Alert, Card, PageHeader } from "./ui";

// Shared by the Sales & Category, Ops and Business Leader portals; each
// portal page passes its own stage.

export async function ReviewQueuePage({ stage }: { stage: Stage }) {
  const user = await requireRole(stage);
  const { pending, reviewed } = reviewQueue(user);
  const earlier = STAGES.slice(0, STAGES.indexOf(stage)).map((s) => STAGE_LABEL[s]);
  return (
    <>
      <PageHeader
        title={`${STAGE_LABEL[stage]} review`}
        subtitle={
          earlier.length
            ? `Properties already approved by ${earlier.join(" and ")}, waiting on your team.`
            : "New properties from the real estate team, waiting on your team."
        }
      />
      <Alert tone="info">{ROLE_INFO[stage].description}</Alert>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Awaiting your decision ({pending.length})</h2>
        <PropertyTable properties={pending} role={user.role} hrefBase={`${ROLE_INFO[stage].portal}/properties`} empty="Nothing waiting on your team right now." />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Reviewed ({reviewed.length})</h2>
        <PropertyTable properties={reviewed} role={user.role} hrefBase={`${ROLE_INFO[stage].portal}/properties`} empty="Your team hasn't reviewed any properties yet." />
      </section>
    </>
  );
}

export async function ReviewPropertyPage({ stage, id, decided }: { stage: Stage; id: string; decided: boolean }) {
  const user = await requireRole(stage);
  const property = getProperty(user, Number(id));
  if (!property) notFound();
  const waiting = property.status === pendingStatus(stage);
  const earlier = STAGES.slice(0, STAGES.indexOf(stage));
  const own = property.decisions.find((d) => d.round === property.round && d.stage === stage);

  return (
    <PropertyDetail
      property={property}
      role={user.role}
      aside={
        <>
          {decided ? <Alert tone="success">Decision recorded. The real estate manager has been notified.</Alert> : null}
          {waiting ? (
            <Card title={`${STAGE_LABEL[stage]} decision`}>
              {earlier.length ? (
                <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">
                  ✓ Approved by {earlier.map((s) => STAGE_LABEL[s]).join(" and ")} — see their remarks under Approvals.
                </p>
              ) : null}
              <DecisionForm propertyId={property.id} teamLabel={STAGE_LABEL[stage]} />
            </Card>
          ) : !own && !decided ? (
            <Alert tone="info">This property isn&apos;t waiting on your team right now.</Alert>
          ) : null}
        </>
      }
    />
  );
}
