"use client";

import { WarehouseInputs } from "@/lib/types";
import NumberField from "./NumberField";

interface Props {
  inputs: WarehouseInputs;
  onChange: (inputs: WarehouseInputs) => void;
}

export default function WarehouseForm({ inputs, onChange }: Props) {
  const set = <K extends keyof WarehouseInputs>(key: K, value: WarehouseInputs[K]) =>
    onChange({ ...inputs, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NumberField
        label="Total warehouse area"
        value={inputs.totalAreaSqFt}
        onChange={(v) => set("totalAreaSqFt", v)}
        suffix="sq ft"
      />
      <NumberField
        label="Office / mezzanine area"
        value={inputs.officeAreaSqFt}
        onChange={(v) => set("officeAreaSqFt", v)}
        suffix="sq ft"
      />
      <NumberField
        label="Clear height"
        value={inputs.clearHeightFt}
        onChange={(v) => set("clearHeightFt", v)}
        suffix="ft"
      />
      <NumberField
        label="Dock doors"
        value={inputs.numDockDoors}
        onChange={(v) => set("numDockDoors", v)}
      />
      <NumberField
        label="Personnel doors"
        value={inputs.numPersonnelDoors}
        onChange={(v) => set("numPersonnelDoors", v)}
      />
      <NumberField
        label="Employees on site"
        value={inputs.numEmployees}
        onChange={(v) => set("numEmployees", v)}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Supply type</span>
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={inputs.hasHTSupply ? "ht" : "lt"}
          onChange={(e) => set("hasHTSupply", e.target.value === "ht")}
        >
          <option value="ht">HT supply (needs own transformer)</option>
          <option value="lt">LT supply (no transformer)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Connected load (kW) — leave blank to estimate from area
        </span>
        <input
          type="number"
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={inputs.connectedLoadKW ?? ""}
          placeholder="auto-estimate"
          onChange={(e) =>
            set("connectedLoadKW", e.target.value === "" ? null : e.target.valueAsNumber)
          }
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Critical / backed-up load (kW) — leave blank to estimate
        </span>
        <input
          type="number"
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={inputs.criticalLoadKW ?? ""}
          placeholder="auto-estimate"
          onChange={(e) =>
            set("criticalLoadKW", e.target.value === "" ? null : e.target.valueAsNumber)
          }
        />
      </label>

      <NumberField
        label="DG backup coverage"
        value={inputs.backupCoveragePercent}
        onChange={(v) => set("backupCoveragePercent", v)}
        suffix="% of connected load"
      />
    </div>
  );
}
