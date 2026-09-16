# Warehouse Electrical Asset Model

A calculator that estimates the count and cost of electrical assets needed
to fit out a new warehouse: lighting, fans, wiring/conduit, switches/sockets,
and distribution hardware (MCBs, junction boxes, etc).

## How it works

1. **Calculator tab** — enter the warehouse area (and an optional name). The
   app computes a line-item list of required assets per category, with an
   editable unit cost per line, and shows category/grand totals.
2. **Formulas tab** — every quantity is derived from an editable ratio (e.g.
   "4.92 LED bulbs per 1000 sq ft") or, for a few items, a fixed count that
   didn't scale with area in the source data.

Inputs, formula ratios, and unit costs are saved to the browser's
`localStorage`, so they persist across reloads on the same device/browser.

## Calibration data

The default ratios and prices are calibrated from two real warehouse
electrical fit-outs (vendor: Bakshi Enterprises):

| Site | Area | Actual total |
|---|---|---|
| Ashok Vihar | 7,000 sq ft | Rs 264,985 |
| Naraina | 5,400 sq ft | Rs 159,255 |

Each item's `qty per 1000 sq ft` is the average of the two sites'
(quantity ÷ area-in-thousands). A few items (MCBs, gangbox) used the exact
same count on both sites regardless of area, so they're modeled as fixed
quantities instead. Miscellaneous small hardware (screws, cable ties,
fasteners, PVC clips) and one-off site costs (scaffolding/ladder rental,
welding) are rolled into a single "Site conditions & hardware allowance"
priced per sq ft, since they don't map to a discrete count.

With only two data points, the aggregate estimate lands within ~5% of the
combined actual cost, but any *single* site's estimate can be off by
15–20% because the two sites weren't uniformly scaled versions of each
other (see caveats below).

### Known low-confidence items

Two items disagreed sharply between the two sites and should not be
trusted as-is — the app flags these in amber and recommends setting them
manually from your own circuit/point plan:

- **Switch, 10A 1-way**: 1 unit at Ashok Vihar vs 87 at Naraina.
- **Socket, 6A universal**: 2 units at Ashok Vihar vs 37 at Naraina.

Several other items (wall/exhaust fan mix, switch 16A count, the PVC
conduit blend) also have moderate variance and are flagged with a shorter
note explaining why.

## Getting more accurate results

Add data from more of your own warehouse fit-outs to tighten the model:

1. For a completed project, record the actual quantity of each asset and
   the total area.
2. Recompute `quantity / (area / 1000)` for each item, and update the ratio
   on the Formulas tab (average it with the existing ratio, weighting by
   how many sites went into each, or replace it if you trust the new data
   more).
3. Update unit costs on the Calculator tab from your vendor's actual quote.

## Development

```bash
npm run dev      # start the dev server at http://localhost:3000
npm test         # run the calculation engine unit tests (includes a
                 # regression check against the two calibration sites)
npm run lint     # lint
npm run build    # production build
```

Calculation logic lives in `lib/calculator.ts`, the asset catalog and
calibrated defaults in `lib/config.ts`, and shared types in `lib/types.ts`.
