"use client";

import { RuleConfig } from "@/lib/types";
import NumberField from "./NumberField";

interface Props {
  rules: RuleConfig;
  onChange: (rules: RuleConfig) => void;
  onReset: () => void;
}

export default function FormulaSettings({ rules, onChange, onReset }: Props) {
  const setGroup = <G extends keyof RuleConfig>(
    group: G,
    key: keyof RuleConfig[G],
    value: number,
  ) => {
    onChange({
      ...rules,
      [group]: { ...rules[group], [key]: value },
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <p>
          These constants are generic starting assumptions. Replace them using
          asset counts and loads from an existing, comparable warehouse to make
          results accurate for your rollout.
        </p>
        <button
          onClick={onReset}
          className="whitespace-nowrap rounded border border-amber-400 px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900"
        >
          Reset to defaults
        </button>
      </div>

      <Section title="Lighting">
        <NumberField
          label="Warehouse floor area per high-bay fixture"
          value={rules.lighting.highBayCoveragePerFixtureSqFt}
          onChange={(v) => setGroup("lighting", "highBayCoveragePerFixtureSqFt", v)}
          suffix="sq ft / fixture"
        />
        <NumberField
          label="Office area per fixture"
          value={rules.lighting.officeCoveragePerFixtureSqFt}
          onChange={(v) => setGroup("lighting", "officeCoveragePerFixtureSqFt", v)}
          suffix="sq ft / fixture"
        />
        <NumberField
          label="Yard lights per dock door"
          value={rules.lighting.yardLightsPerDockDoor}
          onChange={(v) => setGroup("lighting", "yardLightsPerDockDoor", v)}
        />
        <NumberField
          label="Emergency lights per exit"
          value={rules.lighting.emergencyLightsPerExit}
          onChange={(v) => setGroup("lighting", "emergencyLightsPerExit", v)}
        />
        <NumberField
          label="Fixtures per light switch"
          value={rules.lighting.switchesPerFixtures}
          onChange={(v) => setGroup("lighting", "switchesPerFixtures", v)}
        />
      </Section>

      <Section title="Fans">
        <NumberField
          label="Floor area per exhaust fan"
          value={rules.fans.exhaustFanCoveragePerUnitSqFt}
          onChange={(v) => setGroup("fans", "exhaustFanCoveragePerUnitSqFt", v)}
          suffix="sq ft / fan"
        />
        <NumberField
          label="Employees per wall fan"
          value={rules.fans.wallFanPerEmployees}
          onChange={(v) => setGroup("fans", "wallFanPerEmployees", v)}
        />
      </Section>

      <Section title="Sockets">
        <NumberField
          label="Office sockets per 100 sq ft"
          value={rules.sockets.officeSocketsPer100SqFt}
          onChange={(v) => setGroup("sockets", "officeSocketsPer100SqFt", v)}
        />
        <NumberField
          label="Sockets per dock door"
          value={rules.sockets.socketsPerDockDoor}
          onChange={(v) => setGroup("sockets", "socketsPerDockDoor", v)}
        />
      </Section>

      <Section title="Power distribution">
        <NumberField
          label="Area per distribution board"
          value={rules.distribution.sqFtPerDB}
          onChange={(v) => setGroup("distribution", "sqFtPerDB", v)}
          suffix="sq ft / DB"
        />
        <NumberField
          label="MCCBs per DB"
          value={rules.distribution.mccbPerDB}
          onChange={(v) => setGroup("distribution", "mccbPerDB", v)}
        />
        <NumberField
          label="Main incomer MCCBs"
          value={rules.distribution.mainIncomerMCCBs}
          onChange={(v) => setGroup("distribution", "mainIncomerMCCBs", v)}
        />
        <NumberField
          label="Circuit points per MCB way"
          value={rules.distribution.circuitPointsPerMCB}
          onChange={(v) => setGroup("distribution", "circuitPointsPerMCB", v)}
        />
        <NumberField
          label="Cable tray length per 1000 sq ft"
          value={rules.distribution.cableTrayMetersPer1000SqFt}
          onChange={(v) => setGroup("distribution", "cableTrayMetersPer1000SqFt", v)}
          suffix="meters"
        />
      </Section>

      <Section title="Transformer">
        <NumberField
          label="Sizing margin over connected load"
          value={rules.transformer.sizingMarginPercent}
          onChange={(v) => setGroup("transformer", "sizingMarginPercent", v)}
          suffix="%"
        />
      </Section>

      <Section title="Backup power & load estimation">
        <NumberField
          label="Warehouse load density"
          value={rules.backup.warehouseLoadDensityWPerSqFt}
          onChange={(v) => setGroup("backup", "warehouseLoadDensityWPerSqFt", v)}
          suffix="W / sq ft"
        />
        <NumberField
          label="Office load density"
          value={rules.backup.officeLoadDensityWPerSqFt}
          onChange={(v) => setGroup("backup", "officeLoadDensityWPerSqFt", v)}
          suffix="W / sq ft"
        />
        <NumberField
          label="DG sizing margin"
          value={rules.backup.dgSizingMarginPercent}
          onChange={(v) => setGroup("backup", "dgSizingMarginPercent", v)}
          suffix="%"
        />
        <NumberField
          label="Power factor"
          value={rules.backup.powerFactor}
          onChange={(v) => setGroup("backup", "powerFactor", v)}
          step={0.05}
        />
        <NumberField
          label="UPS autonomy"
          value={rules.backup.upsAutonomyMinutes}
          onChange={(v) => setGroup("backup", "upsAutonomyMinutes", v)}
          suffix="minutes"
        />
        <NumberField
          label="Battery unit capacity"
          value={rules.backup.batteryUnitKWh}
          onChange={(v) => setGroup("backup", "batteryUnitKWh", v)}
          suffix="kWh"
          step={0.1}
        />
        <NumberField
          label="Critical load share (when not specified)"
          value={rules.backup.criticalLoadSharePercent}
          onChange={(v) => setGroup("backup", "criticalLoadSharePercent", v)}
          suffix="% of connected load"
        />
      </Section>

      <Section title="Earthing">
        <NumberField
          label="Earthing pits per DB"
          value={rules.earthing.pitsPerDB}
          onChange={(v) => setGroup("earthing", "pitsPerDB", v)}
        />
        <NumberField
          label="Earthing pits per transformer/DG"
          value={rules.earthing.pitsPerTransformerOrDG}
          onChange={(v) => setGroup("earthing", "pitsPerTransformerOrDG", v)}
        />
      </Section>

      <Section title="Fire safety">
        <NumberField
          label="Smoke detector coverage"
          value={rules.fireSafety.smokeDetectorCoverageSqFt}
          onChange={(v) => setGroup("fireSafety", "smokeDetectorCoverageSqFt", v)}
          suffix="sq ft / detector"
        />
        <NumberField
          label="Fire zone panel coverage"
          value={rules.fireSafety.zonePanelCoverageSqFt}
          onChange={(v) => setGroup("fireSafety", "zonePanelCoverageSqFt", v)}
          suffix="sq ft / zone panel"
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}
