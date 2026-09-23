"use client";

import { useActionState } from "react";
import { discardDraft, submitForReview, type ActionState } from "@/app/actions/properties";
import { Alert, buttonClass } from "./ui";

export default function SubmitPanel({
  propertyId,
  resubmission,
  canDelete,
  mediaCount,
}: {
  propertyId: number;
  resubmission: boolean;
  canDelete: boolean;
  mediaCount: number;
}) {
  const [submitState, submit, submitting] = useActionState<ActionState, FormData>(submitForReview, {});
  const [deleteState, remove, deleting] = useActionState<ActionState, FormData>(discardDraft, {});
  const error = submitState.error ?? deleteState.error;

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {mediaCount === 0 ? (
        <p className="text-sm text-zinc-500">Add at least one photo or video to submit.</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <form action={submit}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <button type="submit" disabled={submitting || mediaCount === 0} className={buttonClass.primary}>
            {submitting ? "Submitting…" : resubmission ? "Resubmit to Sales & Category" : "Submit to Sales & Category"}
          </button>
        </form>
        {canDelete ? (
          <form
            action={remove}
            onSubmit={(e) => {
              if (!confirm("Delete this draft and its photos/videos?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <button type="submit" disabled={deleting} className={buttonClass.danger}>
              Delete draft
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
