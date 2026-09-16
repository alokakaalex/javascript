import { AssetLine, RuleConfig, WarehouseInputs } from "./types";

const ceil = (n: number) => Math.max(0, Math.ceil(n));

export function estimateConnectedLoadKW(
  inputs: WarehouseInputs,
  rules: RuleConfig,
): number {
  if (inputs.connectedLoadKW != null) return inputs.connectedLoadKW;
  const floorArea = Math.max(0, inputs.totalAreaSqFt - inputs.officeAreaSqFt);
  const watts =
    floorArea * rules.backup.warehouseLoadDensityWPerSqFt +
    inputs.officeAreaSqFt * rules.backup.officeLoadDensityWPerSqFt;
  return watts / 1000;
}

export function estimateCriticalLoadKW(
  inputs: WarehouseInputs,
  rules: RuleConfig,
  connectedLoadKW: number,
): number {
  if (inputs.criticalLoadKW != null) return inputs.criticalLoadKW;
  return (connectedLoadKW * rules.backup.criticalLoadSharePercent) / 100;
}

export function computeAssets(
  inputs: WarehouseInputs,
  rules: RuleConfig,
): AssetLine[] {
  const floorArea = Math.max(0, inputs.totalAreaSqFt - inputs.officeAreaSqFt);
  const numExits = inputs.numDockDoors + inputs.numPersonnelDoors;

  const connectedLoadKW = estimateConnectedLoadKW(inputs, rules);
  const criticalLoadKW = estimateCriticalLoadKW(inputs, rules, connectedLoadKW);

  const lines: AssetLine[] = [];

  // ---- Lighting ----
  const highBayFixtures = ceil(
    floorArea / rules.lighting.highBayCoveragePerFixtureSqFt,
  );
  lines.push({
    id: "highbay-fixtures",
    category: "Lighting",
    name: "High-bay LED fixtures",
    unit: "fixture",
    quantity: highBayFixtures,
    formula: `ceil(floor area ${floorArea.toFixed(0)} sqft / ${rules.lighting.highBayCoveragePerFixtureSqFt} sqft per fixture)`,
  });

  const officeFixtures = ceil(
    inputs.officeAreaSqFt / rules.lighting.officeCoveragePerFixtureSqFt,
  );
  lines.push({
    id: "office-fixtures",
    category: "Lighting",
    name: "Office/panel light fixtures (bulbs/tubes)",
    unit: "fixture",
    quantity: officeFixtures,
    formula: `ceil(office area ${inputs.officeAreaSqFt} sqft / ${rules.lighting.officeCoveragePerFixtureSqFt} sqft per fixture)`,
  });

  const yardLights = inputs.numDockDoors * rules.lighting.yardLightsPerDockDoor;
  lines.push({
    id: "yard-lights",
    category: "Lighting",
    name: "Exterior / yard lights",
    unit: "fixture",
    quantity: yardLights,
    formula: `${inputs.numDockDoors} dock doors x ${rules.lighting.yardLightsPerDockDoor} per door`,
  });

  const emergencyLights = numExits * rules.lighting.emergencyLightsPerExit;
  lines.push({
    id: "emergency-lights",
    category: "Lighting",
    name: "Emergency / exit lights",
    unit: "fixture",
    quantity: emergencyLights,
    formula: `${numExits} exits (dock + personnel doors) x ${rules.lighting.emergencyLightsPerExit} per exit`,
  });

  const lightSwitches = ceil(
    (highBayFixtures + officeFixtures) / rules.lighting.switchesPerFixtures,
  );
  lines.push({
    id: "light-switches",
    category: "Lighting",
    name: "Light switches / contactors",
    unit: "unit",
    quantity: lightSwitches,
    formula: `ceil(${highBayFixtures + officeFixtures} fixtures / ${rules.lighting.switchesPerFixtures} per switch)`,
  });

  // ---- Motor, Equipment & Safety (incl. fans, sockets) ----
  const exhaustFans = ceil(
    floorArea / rules.fans.exhaustFanCoveragePerUnitSqFt,
  );
  lines.push({
    id: "exhaust-fans",
    category: "Motor, Equipment & Safety",
    name: "Exhaust / ventilation fans",
    unit: "fan",
    quantity: exhaustFans,
    formula: `ceil(floor area ${floorArea.toFixed(0)} sqft / ${rules.fans.exhaustFanCoveragePerUnitSqFt} sqft per fan)`,
  });

  const wallFans = ceil(inputs.numEmployees / rules.fans.wallFanPerEmployees);
  lines.push({
    id: "wall-fans",
    category: "Motor, Equipment & Safety",
    name: "Wall/pedestal fans (office & break areas)",
    unit: "fan",
    quantity: wallFans,
    formula: `ceil(${inputs.numEmployees} employees / ${rules.fans.wallFanPerEmployees} per fan)`,
  });

  const officeSockets = ceil(
    (inputs.officeAreaSqFt / 100) * rules.sockets.officeSocketsPer100SqFt,
  );
  const dockSockets = inputs.numDockDoors * rules.sockets.socketsPerDockDoor;
  lines.push({
    id: "power-sockets",
    category: "Motor, Equipment & Safety",
    name: "Power sockets (5/15A)",
    unit: "socket",
    quantity: officeSockets + dockSockets,
    formula: `ceil(office area / 100 sqft) x ${rules.sockets.officeSocketsPer100SqFt} + ${inputs.numDockDoors} dock doors x ${rules.sockets.socketsPerDockDoor}`,
  });

  lines.push({
    id: "dock-leveler-points",
    category: "Motor, Equipment & Safety",
    name: "Dock leveler motor power points",
    unit: "point",
    quantity: inputs.numDockDoors,
    formula: `1 per dock door (${inputs.numDockDoors} dock doors)`,
  });

  const smokeDetectors = ceil(
    inputs.totalAreaSqFt / rules.fireSafety.smokeDetectorCoverageSqFt,
  );
  lines.push({
    id: "smoke-detectors",
    category: "Motor, Equipment & Safety",
    name: "Smoke detectors",
    unit: "unit",
    quantity: smokeDetectors,
    formula: `ceil(total area ${inputs.totalAreaSqFt} sqft / ${rules.fireSafety.smokeDetectorCoverageSqFt} sqft per detector)`,
  });

  const fireZonePanels = ceil(
    inputs.totalAreaSqFt / rules.fireSafety.zonePanelCoverageSqFt,
  );
  lines.push({
    id: "fire-alarm-panels",
    category: "Motor, Equipment & Safety",
    name: "Fire alarm panel (1 main + zone panels)",
    unit: "panel",
    quantity: 1 + fireZonePanels,
    formula: `1 main + ceil(total area / ${rules.fireSafety.zonePanelCoverageSqFt} sqft per zone panel)`,
  });

  lines.push({
    id: "exit-signage",
    category: "Motor, Equipment & Safety",
    name: "Illuminated exit signage",
    unit: "unit",
    quantity: numExits,
    formula: `1 per exit (${numExits} exits)`,
  });

  // ---- Power Distribution ----
  const dbs = ceil(inputs.totalAreaSqFt / rules.distribution.sqFtPerDB);
  lines.push({
    id: "distribution-boards",
    category: "Power Distribution",
    name: "Distribution boards (DBs)",
    unit: "board",
    quantity: dbs,
    formula: `ceil(total area ${inputs.totalAreaSqFt} sqft / ${rules.distribution.sqFtPerDB} sqft per DB)`,
  });

  lines.push({
    id: "main-lt-panel",
    category: "Power Distribution",
    name: "Main LT panel",
    unit: "panel",
    quantity: 1,
    formula: "1 fixed (single main incoming panel)",
  });

  const mccbs = dbs * rules.distribution.mccbPerDB + rules.distribution.mainIncomerMCCBs;
  lines.push({
    id: "mccbs",
    category: "Power Distribution",
    name: "MCCBs",
    unit: "unit",
    quantity: mccbs,
    formula: `${dbs} DBs x ${rules.distribution.mccbPerDB} + ${rules.distribution.mainIncomerMCCBs} main incomers`,
  });

  const totalCircuitPoints =
    highBayFixtures + officeFixtures + yardLights + officeSockets + dockSockets;
  const mcbs = ceil(totalCircuitPoints / rules.distribution.circuitPointsPerMCB);
  lines.push({
    id: "mcbs",
    category: "Power Distribution",
    name: "MCBs (final distribution)",
    unit: "unit",
    quantity: mcbs,
    formula: `ceil(${totalCircuitPoints} circuit points / ${rules.distribution.circuitPointsPerMCB} points per MCB way)`,
  });

  const transformerCount = inputs.hasHTSupply ? 1 : 0;
  const transformerKVA = inputs.hasHTSupply
    ? Math.round(
        (connectedLoadKW * (1 + rules.transformer.sizingMarginPercent / 100)) /
          rules.backup.powerFactor,
      )
    : 0;
  lines.push({
    id: "transformer",
    category: "Power Distribution",
    name: `Distribution transformer${transformerCount ? ` (~${transformerKVA} kVA)` : ""}`,
    unit: "unit",
    quantity: transformerCount,
    formula: inputs.hasHTSupply
      ? `HT supply selected: (${connectedLoadKW.toFixed(1)} kW load x ${1 + rules.transformer.sizingMarginPercent / 100} margin) / ${rules.backup.powerFactor} PF`
      : "Not required (LT supply assumed)",
  });

  const cableTrayMeters = Math.round(
    (inputs.totalAreaSqFt / 1000) * rules.distribution.cableTrayMetersPer1000SqFt,
  );
  lines.push({
    id: "cable-tray",
    category: "Power Distribution",
    name: "Cable tray / conduit run",
    unit: "meter",
    quantity: cableTrayMeters,
    formula: `(total area / 1000 sqft) x ${rules.distribution.cableTrayMetersPer1000SqFt} m per 1000 sqft`,
  });

  // ---- Backup Power ----
  const dgKVA = Math.round(
    ((connectedLoadKW * inputs.backupCoveragePercent) / 100) *
      (1 + rules.backup.dgSizingMarginPercent / 100) /
      rules.backup.powerFactor,
  );
  lines.push({
    id: "dg-set",
    category: "Backup Power",
    name: `DG set (~${dgKVA} kVA)`,
    unit: "unit",
    quantity: dgKVA > 0 ? 1 : 0,
    formula: `(${connectedLoadKW.toFixed(1)} kW x ${inputs.backupCoveragePercent}% coverage x ${1 + rules.backup.dgSizingMarginPercent / 100} margin) / ${rules.backup.powerFactor} PF`,
  });

  lines.push({
    id: "ats-panel",
    category: "Backup Power",
    name: "ATS (automatic transfer switch) panel",
    unit: "panel",
    quantity: dgKVA > 0 ? 1 : 0,
    formula: "1 if DG set present, else 0",
  });

  const upsKVA = Math.round(criticalLoadKW / rules.backup.powerFactor);
  lines.push({
    id: "ups-inverter",
    category: "Backup Power",
    name: `UPS / inverter (~${upsKVA} kVA)`,
    unit: "unit",
    quantity: upsKVA > 0 ? 1 : 0,
    formula: `critical load ${criticalLoadKW.toFixed(1)} kW / ${rules.backup.powerFactor} PF`,
  });

  const batteryKWh =
    (criticalLoadKW * rules.backup.upsAutonomyMinutes) / 60;
  const batteries = ceil(batteryKWh / rules.backup.batteryUnitKWh);
  lines.push({
    id: "batteries",
    category: "Backup Power",
    name: "Battery bank units",
    unit: "unit",
    quantity: batteries,
    formula: `ceil((${criticalLoadKW.toFixed(1)} kW x ${rules.backup.upsAutonomyMinutes} min autonomy / 60) / ${rules.backup.batteryUnitKWh} kWh per unit)`,
  });

  // ---- Earthing (grouped under Power Distribution) ----
  const earthingPits =
    dbs * rules.earthing.pitsPerDB +
    (transformerCount + (dgKVA > 0 ? 1 : 0)) * rules.earthing.pitsPerTransformerOrDG;
  lines.push({
    id: "earthing-pits",
    category: "Power Distribution",
    name: "Earthing pits",
    unit: "pit",
    quantity: earthingPits,
    formula: `${dbs} DBs x ${rules.earthing.pitsPerDB} + (transformer + DG) x ${rules.earthing.pitsPerTransformerOrDG}`,
  });

  return lines;
}
