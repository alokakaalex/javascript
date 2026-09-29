import { formatDateTime } from "@/lib/expansion/format";
import type { PropertyView } from "@/lib/expansion/types";
import { DECISION_LABEL, STAGE_INFO, STAGES, stageIndex, type Stage } from "@/lib/expansion/workflow";

type StepState = "done" | "current" | "hold" | "rejected" | "upcoming";

function stepState(p: PropertyView, stage: Stage): StepState {
  if (p.state === "draft" || !p.stage) return "upcoming";
  if (p.state === "completed") return "done";
  const here = stageIndex(p.stage);
  const i = stageIndex(stage);
  if (i < here) return "done";
  if (i > here) return "upcoming";
  return p.state === "rejected" ? "rejected" : p.state === "on_hold" ? "hold" : "current";
}

const DOT: Record<StepState, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-amber-400 text-amber-950",
  hold: "bg-violet-600 text-white",
  rejected: "bg-rose-600 text-white",
  upcoming: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800",
};

const TEXT: Record<StepState, string> = {
  done: "Done",
  current: "In progress",
  hold: "On hold",
  rejected: "Rejected",
  upcoming: "Not reached",
};

/** Extra line under a task stage, showing when/what completed it. */
function taskNote(p: PropertyView, stage: Stage): string | null {
  const paid = (kind: string) => p.payments?.find((x) => x.kind === kind && x.status === "paid");
  switch (stage) {
    case "documents":
      return p.documentsCompletedAt ? `Submitted ${formatDateTime(p.documentsCompletedAt)}` : null;
    case "loi":
      return p.loiSentAt ? `Issued ${formatDateTime(p.loiSentAt)}${p.loiSentTo ? ` to ${p.loiSentTo}` : ""}` : null;
    case "token_payment": {
      const x = paid("token");
      return x ? `Paid ${x.paidOn} · UTR ${x.utr}` : null;
    }
    case "balance_payment": {
      const x = paid("balance");
      return x ? `Paid ${x.paidOn} · UTR ${x.utr}` : null;
    }
    default:
      return null;
  }
}

export default function Pipeline({ property }: { property: PropertyView }) {
  const current = property.decisions.filter((d) => d.round === property.round);
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {STAGES.map((stage, i) => {
        const state = stepState(property, stage);
        const decisions = current.filter((d) => d.stage === stage);
        const note = taskNote(property, stage);
        return (
          <li key={stage} className={`rounded-md border p-3 ${state === "current" || state === "hold" ? "border-amber-300 dark:border-amber-800" : "border-zinc-200 dark:border-zinc-800"}`}>
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${DOT[state]}`}>
                {state === "done" ? "✓" : state === "rejected" ? "✕" : i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{STAGE_INFO[stage].label}</div>
                <div className="text-xs text-zinc-500">{TEXT[state]}</div>
              </div>
            </div>
            {decisions.map((d) => (
              <div key={d.id} className="mt-2 text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {DECISION_LABEL[d.decision]} · {d.decidedByName}
                </span>
                <p className="line-clamp-3 text-zinc-600 dark:text-zinc-400" title={d.remarks}>
                  “{d.remarks}”
                </p>
                <p className="text-zinc-400">{formatDateTime(d.decidedAt)}</p>
              </div>
            ))}
            {note ? <p className="mt-2 text-xs text-zinc-500">{note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DecisionHistory({ property }: { property: PropertyView }) {
  if (property.decisions.length === 0) return <p className="text-sm text-zinc-500">No decisions yet.</p>;
  return (
    <ol className="space-y-3 text-sm">
      {[...property.decisions].reverse().map((d) => (
        <li key={d.id} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{STAGE_INFO[d.stage].label}</span>
            <span
              className={
                d.decision === "approved"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : d.decision === "hold"
                    ? "text-violet-700 dark:text-violet-400"
                    : "text-rose-700 dark:text-rose-400"
              }
            >
              {DECISION_LABEL[d.decision]}
            </span>
            <span className="text-xs text-zinc-500">
              {d.decidedByName} · {formatDateTime(d.decidedAt)}
              {property.round > 1 ? ` · round ${d.round}` : ""}
            </span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{d.remarks}</p>
        </li>
      ))}
    </ol>
  );
}
