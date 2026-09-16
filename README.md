# Warehouse Electrical Asset Model

A calculator that estimates the count and cost of electrical assets needed
to fit out a new warehouse: power distribution, lighting, backup power, and
motor/equipment & safety items (fans, sockets, switches, fire alarm, etc).

## How it works

1. **Calculator tab** — enter warehouse parameters (area, dock doors,
   employees, supply type, etc). The app computes a line-item list of
   required assets per category, and lets you enter a unit cost per asset to
   get category and grand totals.
2. **Formulas tab** — every quantity is derived from an editable constant
   (e.g. "1 high-bay fixture per 400 sq ft of floor area"). These start as
   generic industry rules-of-thumb — they are **not** derived from your
   warehouse.

Inputs, formula constants, and unit costs are saved to the browser's
`localStorage`, so they persist across reloads on the same device/browser.

## Getting accurate results

The starting formulas and $0 unit costs are placeholders. To make this
accurate for your rollout:

1. Take an existing, comparable warehouse and count how many of each asset
   it actually has (DBs, fixtures, fans, sockets, etc), plus its floor area,
   dock doors, employee count, and connected/backup load.
2. Back-calculate the coverage ratios (e.g. sq ft per fixture) from that
   data and update them on the Formulas tab.
3. Enter real unit costs (from vendor quotes) per asset on the Calculator
   tab.

Once calibrated against a real site, the same formulas can be reused for
future warehouses by just changing the input parameters.

## Development

```bash
npm run dev      # start the dev server at http://localhost:3000
npm test         # run the calculation engine unit tests
npm run lint     # lint
npm run build    # production build
```

Calculation logic lives in `lib/calculator.ts`, formula defaults in
`lib/config.ts`, and shared types in `lib/types.ts`.
