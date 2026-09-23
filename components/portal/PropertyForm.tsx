"use client";

import { startTransition, useActionState } from "react";
import { saveProperty, type PropertyFormState } from "@/app/actions/properties";
import type { PropertyInput } from "@/lib/expansion/propertyInput";
import type { PropertyView } from "@/lib/expansion/types";
import { Alert, buttonClass, inputClass } from "./ui";

type Name = keyof PropertyInput;

function Field({
  name,
  label,
  hint,
  error,
  children,
  className = "",
}: {
  name: Name;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

function initial(property: PropertyView | undefined, name: Name): string {
  if (!property) return "";
  if (name === "mapUrl") {
    return property.mapUrl ?? (property.latitude != null ? `${property.latitude}, ${property.longitude}` : "");
  }
  const v = property[name as keyof PropertyView];
  return v == null ? "" : String(v);
}

export default function PropertyForm({ property }: { property?: PropertyView }) {
  const [state, action, pending] = useActionState<PropertyFormState, FormData>(saveProperty, {});
  const errors = state.fieldErrors ?? {};

  const input = (name: Name, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={name}
      name={name}
      defaultValue={initial(property, name)}
      aria-invalid={errors[name] ? true : undefined}
      aria-describedby={errors[name] ? `${name}-error` : undefined}
      className={`${inputClass} ${errors[name] ? "border-rose-400" : ""}`}
      required
      {...props}
    />
  );
  const amount = { type: "number", min: 0, step: "any", inputMode: "decimal" as const };
  const whole = { type: "number", min: 0, step: 1, inputMode: "numeric" as const };

  return (
    <form
      className="space-y-8"
      // Submitting through onSubmit (not the action prop) keeps what was typed
      // when the server sends back validation errors; React resets forms after
      // action-prop submissions.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {property ? <input type="hidden" name="propertyId" value={property.id} /> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Property &amp; location</legend>
        <Field name="title" label="Property name" hint="e.g. Rohini Sec-7 warehouse" error={errors.title}>
          {input("title", { maxLength: 150 })}
        </Field>
        <Field name="ownerName" label="Property owner name" error={errors.ownerName}>
          {input("ownerName", { maxLength: 150 })}
        </Field>
        <Field name="address" label="Address" error={errors.address} className="sm:col-span-2">
          {input("address", { maxLength: 500 })}
        </Field>
        <Field
          name="mapUrl"
          label="Google Maps location"
          hint="Paste the Google Maps share link, or coordinates like 28.7041, 77.1025."
          error={errors.mapUrl}
          className="sm:col-span-2"
        >
          {input("mapUrl", { maxLength: 2000, placeholder: "https://maps.app.goo.gl/…" })}
        </Field>
        <Field name="areaSqft" label="Area (sq ft)" error={errors.areaSqft}>
          {input("areaSqft", { ...amount, min: 1 })}
        </Field>
        <Field name="handoverDate" label="Handover date" error={errors.handoverDate}>
          {input("handoverDate", { type: "date" })}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Commercials (₹)</legend>
        <Field name="rentPerMonth" label="Rent per month (₹)" error={errors.rentPerMonth}>
          {input("rentPerMonth", { ...amount, min: 1 })}
        </Field>
        <Field name="securityDeposit" label="Security deposit (₹)" error={errors.securityDeposit}>
          {input("securityDeposit", amount)}
        </Field>
        <Field name="advanceRent" label="Advance rent (₹)" error={errors.advanceRent}>
          {input("advanceRent", amount)}
        </Field>
        <Field name="rentEscalationPct" label="Rent escalation (% per year)" error={errors.rentEscalationPct}>
          {input("rentEscalationPct", { ...amount, max: 100 })}
        </Field>
        <Field name="rentFreeDays" label="Rent-free days" error={errors.rentFreeDays}>
          {input("rentFreeDays", whole)}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Lease terms</legend>
        <Field name="leaseTenureMonths" label="Lease tenure (months)" hint="e.g. 108 for 9 years" error={errors.leaseTenureMonths}>
          {input("leaseTenureMonths", { ...whole, min: 1 })}
        </Field>
        <Field name="lockInMonths" label="Lock-in period (months)" error={errors.lockInMonths}>
          {input("lockInMonths", whole)}
        </Field>
      </fieldset>

      <Field name="notes" label="Other details (optional)" hint="Only you and the access manager see these notes." error={errors.notes}>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={5000}
          defaultValue={property?.notes ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Saving…" : property ? "Save changes" : "Save & continue to photos/videos"}
        </button>
      </div>
    </form>
  );
}
