import { RuleConfig, WarehouseInputs } from "./types";

// Starting assumptions only. These are generic industry rules-of-thumb, not
// derived from any specific site. Replace them (via the Formulas tab) once
// you have counts/loads from an existing comparable warehouse — that is what
// will make the output accurate for your use case.
export const DEFAULT_RULES: RuleConfig = {
  lighting: {
    highBayCoveragePerFixtureSqFt: 400,
    officeCoveragePerFixtureSqFt: 100,
    yardLightsPerDockDoor: 1,
    emergencyLightsPerExit: 1,
    switchesPerFixtures: 5,
  },
  fans: {
    exhaustFanCoveragePerUnitSqFt: 2500,
    wallFanPerEmployees: 10,
  },
  sockets: {
    officeSocketsPer100SqFt: 1,
    socketsPerDockDoor: 1,
  },
  distribution: {
    sqFtPerDB: 5000,
    mccbPerDB: 6,
    mainIncomerMCCBs: 2,
    circuitPointsPerMCB: 8,
    cableTrayMetersPer1000SqFt: 12,
  },
  transformer: {
    sizingMarginPercent: 25,
  },
  backup: {
    warehouseLoadDensityWPerSqFt: 3,
    officeLoadDensityWPerSqFt: 8,
    dgSizingMarginPercent: 20,
    powerFactor: 0.8,
    upsAutonomyMinutes: 30,
    batteryUnitKWh: 1.2,
    criticalLoadSharePercent: 15,
  },
  earthing: {
    pitsPerDB: 1,
    pitsPerTransformerOrDG: 2,
  },
  fireSafety: {
    smokeDetectorCoverageSqFt: 900,
    zonePanelCoverageSqFt: 10000,
  },
};

export const DEFAULT_INPUTS: WarehouseInputs = {
  totalAreaSqFt: 50000,
  officeAreaSqFt: 2000,
  clearHeightFt: 32,
  numDockDoors: 8,
  numPersonnelDoors: 4,
  numEmployees: 40,
  hasHTSupply: true,
  connectedLoadKW: null,
  criticalLoadKW: null,
  backupCoveragePercent: 80,
};

// Unit costs are intentionally left at 0. Fill these in on the Price List
// tab with real vendor/quote numbers — the app will not guess market prices.
export const DEFAULT_PRICE_LIST: Record<string, number> = {};
