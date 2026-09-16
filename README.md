# Warehouse Electrical Asset Model

A calculator that estimates the count and cost of electrical assets needed
to fit out a new warehouse: lighting, fans, wiring/conduit, switches/sockets,
distribution hardware (MCBs, junction boxes, etc), site conditions, and
installation labour.

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

The default ratios and prices are calibrated from three real warehouse
electrical fit-outs:

| Site | Area | Vendor | Actual total |
|---|---|---|---|
| Ashok Vihar | 7,000 sq ft | Bakshi Enterprises | Rs 264,985 |
| Naraina | 5,400 sq ft | Bakshi Enterprises | Rs 159,255 |
| Jahangirpuri | 5,400 sq ft | Bakshi Associate | Rs 199,500 (incl. Rs 30,310 labour) |

For each item, `qty per 1000 sq ft` is the average of (quantity ÷
area-in-thousands) across whichever sites itemized that item — a site that
didn't list a comparable line is excluded from that item's ratio rather than
treated as needing zero (silence isn't evidence of zero; it usually means
that vendor bundled it into a different line). A few items (MCBs, gangbox)
used the exact same count at every site that itemized them regardless of
area, so they're modeled as fixed quantities instead.

Naraina and Jahangirpuri are both 5,400 sq ft but from different vendors,
which is a useful cross-check: their **materials-only** totals were Rs
159,255 vs Rs 169,190 — about 6% apart, which is reassuring for the overall
$/sqft level even though the two vendors itemized things quite differently.

### Two lighting schemes, not additive

Ashok Vihar and Naraina used point LED bulbs; Jahangirpuri used LED tube
lights instead. These are alternative designs, not things you'd install
both of, so the tube-light item (`led-tube-light-22w`) defaults to **Rs 0**
unit cost to avoid double-counting. If your design uses tube lights, set its
unit cost (Rs 235 at Jahangirpuri) and zero out the LED-bulb/shade/holder
lines instead.

### Labour is single-site data

Only Jahangirpuri's quote separately itemized installation labour (Rs
30,310, ~15% of that project's total). Ashok Vihar and Naraina's quotes had
no labour line at all — meaning it was either self-installed, billed
separately outside these figures, or bundled into their (comparatively
lower) material prices. The labour allowance defaults to a non-zero per-sqft
rate since most new projects do need to budget for it, but treat this as a
single data point and set it to 0 if your vendor's material pricing already
includes installation.

### Known low-confidence items

Two items disagreed sharply between sites and should not be trusted as-is
— the app flags these in amber and recommends setting them manually from
your own circuit/point plan:

- **Switch, 10A 1-way**: 1 unit at Ashok Vihar vs 87 at Naraina; not
  itemized at all at Jahangirpuri.
- **Socket, 6A universal**: 2 units at Ashok Vihar, 37 at Naraina, 25 at
  Jahangirpuri — and Jahangirpuri's "sockets" were priced at ~Rs 510 each
  (a heavier-duty spec), not blended into the Rs 80 default.

The PVC conduit line also carries a caveat: Jahangirpuri priced the same
item name at ~30x the other two sites' price, almost certainly because it
was quoted as a bulk coil rather than a single length — that site's price
is excluded from the blended default, but confirm the purchase unit with
your own vendor.

## Getting more accurate results

Add data from more of your own warehouse fit-outs to tighten the model:

1. For a completed project, record the actual quantity of each asset and
   the total area.
2. Recompute `quantity / (area / 1000)` for each item, and update the ratio
   on the Formulas tab (average it with the existing ratio, weighting by
   how many sites went into each, or replace it if you trust the new data
   more).
3. Update unit costs on the Calculator tab from your vendor's actual quote.
4. If a site didn't itemize a given line, don't average it in as zero —
   leave the existing ratio alone (see "Calibration data" above for why).

## Development

```bash
npm run dev      # start the dev server at http://localhost:3000
npm test         # run the calculation engine unit tests (includes a
                 # regression check against all three calibration sites)
npm run lint     # lint
npm run build    # production build
```

Calculation logic lives in `lib/calculator.ts`, the asset catalog and
calibrated defaults in `lib/config.ts`, and shared types in `lib/types.ts`.
