import { formatDateTime } from "@/lib/expansion/format";
import type { DecisionRecord, PropertyView } from "@/lib/expansion/types";
import { DECISION_LABEL, pendingStage, STAGE_LABEL, STAGES, type Stage } from "@/lib/expansion/workflow";

type StepState = "waiting" | "pending" | "approved" | "passed" | "hidden";

function stepState(property: PropertyView, stage: Stage, decision: DecisionRecord | undefined, visible: boolean): StepState {
  if (decision) return decision.decision;
  if (!visible) return "hidden";
  if (property.status === "draft") return "waiting";
  return pendingStage(property.status) === stage ? "pending" : "waiting";
}

const DOT: Record<StepState, string> = {
  waiting: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800",
  hidden: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800",
  pending: "bg-amber-400 text-amber-950",
  approved: "bg-emerald-600 text-white",
  passed: "bg-rose-600 text-white",
};

const STATE_TEXT: Record<StepState, string> = {
  waiting: "Not reached",
  hidden: "—",
  pending: "Awaiting decision",
  approved: "Approved",
  passed: "Passed",
};

/**
 * The three review stages for the property's current round, with each
 * team's decision and remarks. `visibleStages` limits which teams' outcomes
 * the viewer may see.
 */
export default function StageTracker({ property, visibleStages = STAGES }: { property: PropertyView; visibleStages?: readonly Stage[] }) {
  const current = property.decisions.filter((d) => d.round === property.round);
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {STAGES.map((stage, i) => {
        const decision = current.find((d) => d.stage === stage);
        const state = stepState(property, stage, decision, visibleStages.includes(stage));
        return (
          <li key={stage} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${DOT[state]}`}>
                {state === "approved" ? "✓" : state === "passed" ? "✕" : i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{STAGE_LABEL[stage]}</div>
                <div className="text-xs text-zinc-500">{STATE_TEXT[state]}</div>
              </div>
            </div>
            {decision ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">“{decision.remarks}”</p>
                <p className="text-xs text-zinc-500">
                  {decision.decidedByName} · {formatDateTime(decision.decidedAt)}
                </p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Earlier review rounds, for properties that were passed and resubmitted. */
export function PastRounds({ property }: { property: PropertyView }) {
  const past = property.decisions.filter((d) => d.round < property.round);
  if (past.length === 0) return null;
  const rounds = [...new Set(past.map((d) => d.round))].sort((a, b) => b - a);
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Earlier review rounds ({rounds.length})</summary>
      <div className="mt-3 space-y-3">
        {rounds.map((round) => (
          <div key={round}>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Round {round}</div>
            <ul className="mt-1 space-y-1">
              {past
                .filter((d) => d.round === round)
                .map((d) => (
                  <li key={d.stage} className="text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">{STAGE_LABEL[d.stage]}</span>: {DECISION_LABEL[d.decision]} — “{d.remarks}”{" "}
                    <span className="text-xs text-zinc-500">
                      ({d.decidedByName}, {formatDateTime(d.decidedAt)})
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
