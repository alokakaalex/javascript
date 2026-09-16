import { CatalogItem, PriceList, RuleConfig, WarehouseInputs } from "./types";

// Calibrated from two real warehouse electrical fit-outs (Bakshi Enterprises
// vendor quotes):
//   Ashok Vihar — 7000 sq ft — total Rs 264,985
//   Naraina     — 5400 sq ft — total Rs 159,255
// qtyPer1000SqFt is the average of each site's (quantity / area-in-1000-sqft).
// Unit costs are the vendor's price where the two sites agreed, or a
// quantity-weighted blend where they used different sizes/brands.
export const CATALOG: CatalogItem[] = [
  // ---- Lighting ----
  {
    id: "led-bulb-35w",
    category: "Lighting",
    name: "LED bulb, 35W",
    unit: "pc",
    qtyPer1000SqFt: 4.92,
    defaultUnitCost: 450,
  },
  {
    id: "led-bulb-shade",
    category: "Lighting",
    name: "LED bulb shade",
    unit: "pc",
    qtyPer1000SqFt: 4.78,
    defaultUnitCost: 85,
  },
  {
    id: "bulb-holder",
    category: "Lighting",
    name: "Bulb holder",
    unit: "pc",
    qtyPer1000SqFt: 4.92,
    defaultUnitCost: 45,
  },
  {
    id: "halogen-100w",
    category: "Lighting",
    name: "Halogen lamp, 100W",
    unit: "pc",
    qtyPer1000SqFt: 0.47,
    defaultUnitCost: 1350,
  },

  // ---- Fans ----
  {
    id: "ceiling-fan",
    category: "Fans",
    name: "Ceiling fan (with rod, copper base)",
    unit: "pc",
    qtyPer1000SqFt: 2.37,
    defaultUnitCost: 3000,
  },
  {
    id: "wall-exhaust-fan",
    category: "Fans",
    name: "Wall / exhaust ventilation fan",
    unit: "pc",
    qtyPer1000SqFt: 1.22,
    defaultUnitCost: 6300,
    note: "Unit cost varies a lot by size (12\"/18\"/24\") and brand — the two sample sites paid anywhere from Rs 1,600 to Rs 10,200 per fan.",
  },

  // ---- Wiring & Conduit ----
  {
    id: "copper-wire-2.5mm",
    category: "Wiring & Conduit",
    name: "Copper wire, 2.5mm (roll)",
    unit: "roll",
    qtyPer1000SqFt: 1.18,
    defaultUnitCost: 4750,
  },
  {
    id: "copper-wire-1.5mm",
    category: "Wiring & Conduit",
    name: "Copper wire, 1.5mm (roll)",
    unit: "roll",
    qtyPer1000SqFt: 1.18,
    defaultUnitCost: 2825,
  },
  {
    id: "flex-wire-5qmm",
    category: "Wiring & Conduit",
    name: "Flexible wire, 5qmm (roll)",
    unit: "roll",
    qtyPer1000SqFt: 0.24,
    defaultUnitCost: 4019,
  },
  {
    id: "wire-1mm-bulk",
    category: "Wiring & Conduit",
    name: "Wire, 1mm (bulk roll)",
    unit: "roll",
    qtyPer1000SqFt: 0.14,
    defaultUnitCost: 1995,
    note: "Only one of the two sample sites needed this — treat as an optional/site-specific item.",
  },
  {
    id: "pvc-conduit",
    category: "Wiring & Conduit",
    name: "PVC flexible pipe / conduit (mixed sizes)",
    unit: "pc",
    qtyPer1000SqFt: 7.06,
    defaultUnitCost: 115,
    note: "Blended across 20mm/25mm conduit and flexible pipe, which have different unit prices — refine if your job uses mostly one size.",
  },
  {
    id: "pvc-tape",
    category: "Wiring & Conduit",
    name: "PVC insulation tape",
    unit: "pc",
    qtyPer1000SqFt: 1.27,
    defaultUnitCost: 12,
  },

  // ---- Switches, Sockets & Distribution ----
  {
    id: "junction-box",
    category: "Switches, Sockets & Distribution",
    name: "Junction box (PVC)",
    unit: "pc",
    qtyPer1000SqFt: 1.54,
    defaultUnitCost: 15,
  },
  {
    id: "compound-box-16a",
    category: "Switches, Sockets & Distribution",
    name: "Compound box, 16A",
    unit: "pc",
    qtyPer1000SqFt: 1.64,
    defaultUnitCost: 350,
  },
  {
    id: "pvc-box-8x3",
    category: "Switches, Sockets & Distribution",
    name: "PVC box, 8x3",
    unit: "pc",
    qtyPer1000SqFt: 0.71,
    defaultUnitCost: 65,
  },
  {
    id: "switch-16a",
    category: "Switches, Sockets & Distribution",
    name: "Switch, 16A 1-way",
    unit: "pc",
    qtyPer1000SqFt: 3.78,
    defaultUnitCost: 72,
    note: "Counts differed 2x between sample sites (2 vs ~5.5 per 1000 sqft) — verify against your actual circuit/point plan.",
  },
  {
    id: "switch-10a",
    category: "Switches, Sockets & Distribution",
    name: "Switch, 10A 1-way",
    unit: "pc",
    qtyPer1000SqFt: 8.13,
    defaultUnitCost: 25,
    note: "⚠️ Low confidence: one sample site used 1 of these, the other used 87, for similarly sized spaces. This average is not reliable — set this manually from your circuit plan.",
  },
  {
    id: "socket-6a",
    category: "Switches, Sockets & Distribution",
    name: "Socket, 6A universal",
    unit: "pc",
    qtyPer1000SqFt: 3.57,
    defaultUnitCost: 80,
    note: "⚠️ Low confidence: counts ranged from 2 to 37 across the two sample sites. Set this manually from your circuit plan.",
  },
  {
    id: "mcb-32a",
    category: "Switches, Sockets & Distribution",
    name: "MCB, 32A",
    unit: "pc",
    fixedQty: 2,
    defaultUnitCost: 160,
    note: "Both sample sites used exactly 2, regardless of area — modeled as a fixed count rather than scaled by area.",
  },
  {
    id: "mcb-25a",
    category: "Switches, Sockets & Distribution",
    name: "MCB, 25A",
    unit: "pc",
    fixedQty: 2,
    defaultUnitCost: 148,
    note: "Both sample sites used exactly 2, regardless of area — modeled as a fixed count rather than scaled by area.",
  },
  {
    id: "surface-gangbox",
    category: "Switches, Sockets & Distribution",
    name: "Surface gangbox",
    unit: "pc",
    fixedQty: 1,
    defaultUnitCost: 60,
  },

  // ---- Site Conditions & Miscellaneous ----
  {
    id: "site-misc-allowance",
    category: "Site Conditions & Miscellaneous",
    name: "Site conditions & hardware allowance",
    unit: "sq ft",
    isAreaAllowance: true,
    defaultUnitCost: 2.82,
    note: "Lump-sum allowance covering screws, cable ties, fasteners, PVC clips, and one-off site costs (scaffolding/ladder rental, welding, etc). This varied 3,135 vs 2,506 Rs/1000 sqft between sample sites depending on ceiling height and site difficulty — adjust up for high-ceiling or hard-access sites.",
  },
];

export const DEFAULT_RULES: RuleConfig = Object.fromEntries(
  CATALOG.map((item) => [
    item.id,
    { fixedQty: item.fixedQty, qtyPer1000SqFt: item.qtyPer1000SqFt },
  ]),
);

export const DEFAULT_PRICE_LIST: PriceList = Object.fromEntries(
  CATALOG.map((item) => [item.id, item.defaultUnitCost]),
);

export const DEFAULT_INPUTS: WarehouseInputs = {
  warehouseName: "",
  totalAreaSqFt: 6000,
};
