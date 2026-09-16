export interface WarehouseInputs {
  totalAreaSqFt: number;
  officeAreaSqFt: number;
  clearHeightFt: number;
  numDockDoors: number;
  numPersonnelDoors: number;
  numEmployees: number;
  hasHTSupply: boolean;
  connectedLoadKW: number | null; // null => estimate from area using load density
  criticalLoadKW: number | null; // null => estimate as a share of connected load
  backupCoveragePercent: number; // % of connected load the DG should cover
}

export type AssetCategory =
  | "Power Distribution"
  | "Lighting"
  | "Backup Power"
  | "Motor, Equipment & Safety";

export interface AssetLine {
  id: string;
  category: AssetCategory;
  name: string;
  unit: string;
  quantity: number;
  formula: string; // human-readable explanation of how quantity was derived
}

export interface AssetResult extends AssetLine {
  unitCost: number;
  totalCost: number;
}

export interface RuleConfig {
  lighting: {
    highBayCoveragePerFixtureSqFt: number;
    officeCoveragePerFixtureSqFt: number;
    yardLightsPerDockDoor: number;
    emergencyLightsPerExit: number;
    switchesPerFixtures: number; // 1 switch per N fixtures
  };
  fans: {
    exhaustFanCoveragePerUnitSqFt: number;
    wallFanPerEmployees: number;
  };
  sockets: {
    officeSocketsPer100SqFt: number;
    socketsPerDockDoor: number;
  };
  distribution: {
    sqFtPerDB: number;
    mccbPerDB: number;
    mainIncomerMCCBs: number;
    circuitPointsPerMCB: number;
    cableTrayMetersPer1000SqFt: number;
  };
  transformer: {
    sizingMarginPercent: number;
  };
  backup: {
    warehouseLoadDensityWPerSqFt: number;
    officeLoadDensityWPerSqFt: number;
    dgSizingMarginPercent: number;
    powerFactor: number;
    upsAutonomyMinutes: number;
    batteryUnitKWh: number;
    criticalLoadSharePercent: number; // used when criticalLoadKW is not provided
  };
  earthing: {
    pitsPerDB: number;
    pitsPerTransformerOrDG: number;
  };
  fireSafety: {
    smokeDetectorCoverageSqFt: number;
    zonePanelCoverageSqFt: number;
  };
}

export type PriceList = Record<string, number>;
