import { describe, expect, it } from "vitest";
import { computeAssets, estimateConnectedLoadKW, estimateCriticalLoadKW } from "./calculator";
import { DEFAULT_RULES } from "./config";
import { WarehouseInputs } from "./types";

const baseInputs: WarehouseInputs = {
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

describe("estimateConnectedLoadKW", () => {
  it("uses the explicit value when provided", () => {
    expect(
      estimateConnectedLoadKW({ ...baseInputs, connectedLoadKW: 250 }, DEFAULT_RULES),
    ).toBe(250);
  });

  it("estimates from area load densities when not provided", () => {
    const floorArea = baseInputs.totalAreaSqFt - baseInputs.officeAreaSqFt;
    const expected =
      (floorArea * DEFAULT_RULES.backup.warehouseLoadDensityWPerSqFt +
        baseInputs.officeAreaSqFt * DEFAULT_RULES.backup.officeLoadDensityWPerSqFt) /
      1000;
    expect(estimateConnectedLoadKW(baseInputs, DEFAULT_RULES)).toBeCloseTo(expected);
  });
});

describe("estimateCriticalLoadKW", () => {
  it("uses the explicit value when provided", () => {
    expect(
      estimateCriticalLoadKW({ ...baseInputs, criticalLoadKW: 30 }, DEFAULT_RULES, 200),
    ).toBe(30);
  });

  it("falls back to a share of connected load", () => {
    const connected = 200;
    const expected = (connected * DEFAULT_RULES.backup.criticalLoadSharePercent) / 100;
    expect(estimateCriticalLoadKW(baseInputs, DEFAULT_RULES, connected)).toBeCloseTo(
      expected,
    );
  });
});

describe("computeAssets", () => {
  it("produces one line per known asset id with non-negative quantities", () => {
    const lines = computeAssets(baseInputs, DEFAULT_RULES);
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    for (const line of lines) {
      expect(line.quantity).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(line.quantity)).toBe(true);
    }
  });

  it("scales high-bay fixture count with floor area", () => {
    const small = computeAssets(baseInputs, DEFAULT_RULES);
    const large = computeAssets(
      { ...baseInputs, totalAreaSqFt: baseInputs.totalAreaSqFt * 2 },
      DEFAULT_RULES,
    );
    const getQty = (lines: typeof small, id: string) =>
      lines.find((l) => l.id === id)!.quantity;
    expect(getQty(large, "highbay-fixtures")).toBeGreaterThan(
      getQty(small, "highbay-fixtures"),
    );
  });

  it("omits the transformer when there is no HT supply", () => {
    const lines = computeAssets({ ...baseInputs, hasHTSupply: false }, DEFAULT_RULES);
    const transformer = lines.find((l) => l.id === "transformer")!;
    expect(transformer.quantity).toBe(0);
  });

  it("includes a transformer sized off connected load when HT supply is selected", () => {
    const lines = computeAssets(
      { ...baseInputs, hasHTSupply: true, connectedLoadKW: 100 },
      DEFAULT_RULES,
    );
    const transformer = lines.find((l) => l.id === "transformer")!;
    expect(transformer.quantity).toBe(1);
  });

  it("sizes the DG set and ATS panel to zero when backup coverage is zero", () => {
    const lines = computeAssets(
      { ...baseInputs, backupCoveragePercent: 0 },
      DEFAULT_RULES,
    );
    expect(lines.find((l) => l.id === "dg-set")!.quantity).toBe(0);
    expect(lines.find((l) => l.id === "ats-panel")!.quantity).toBe(0);
  });

  it("always includes exactly one main LT panel", () => {
    const lines = computeAssets(baseInputs, DEFAULT_RULES);
    expect(lines.find((l) => l.id === "main-lt-panel")!.quantity).toBe(1);
  });
});
