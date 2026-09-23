"use client";

import { useActionState, useState } from "react";
import { recordDecision, type ActionState } from "@/app/actions/properties";
import { Alert, buttonClass, inputClass } from "./ui";

export default function DecisionForm({ propertyId, teamLabel }: { propertyId: number; teamLabel: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordDecision, {});
  const [remarks, setRemarks] = useState("");
  const ready = remarks.trim().length >= 3;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="propertyId" value={propertyId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <label htmlFor="remarks" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Remarks <span className="font-normal text-zinc-500">(required for approve and pass)</span>
      </label>
      <textarea
        id="remarks"
        name="remarks"
        rows={4}
        required
        minLength={3}
        maxLength={5000}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder={`Why is ${teamLabel} approving or passing this property?`}
        className={inputClass}
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending || !ready}
          className={buttonClass.approve}
          onClick={(e) => {
            if (!confirm("Approve this property? This can't be undone.")) e.preventDefault();
          }}
        >
          ✓ Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="passed"
          disabled={pending || !ready}
          className={buttonClass.pass}
          onClick={(e) => {
            if (!confirm("Pass on this property? This can't be undone.")) e.preventDefault();
          }}
        >
          ✕ Pass
        </button>
      </div>
    </form>
  );
}
