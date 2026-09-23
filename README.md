# Expansion Portal

A role-based web app for the expansion project. Real estate managers upload
candidate properties; Sales & Category, Ops and Business Leaders review them
in turn, each seeing only the details they need; and an access manager
controls who holds which role and sees every property end to end. The
warehouse electrical asset calculator lives at `/calculator` in the same
app.

## Roles

| Role | Portal | What they do | What they see of a property |
|---|---|---|---|
| **Access Manager** (admin) | `/admin` | Adds people by email, assigns and changes roles, disables access, issues password-reset links. Dashboard of all properties, CSV export. | Everything: all fields, all photos/videos, every team's decision and remarks, full activity log. |
| **Real Estate Manager** | `/real-estate` | Uploads properties and media, submits them for review, revises and resubmits passed ones. | Everything about their own uploads, plus every decision. |
| **Sales & Category** | `/sales` | First review: approve or pass, with remarks. | Photos/videos, Google Maps location, area (sq ft). |
| **Ops Leader** | `/ops` | Second review, only after Sales approves. | Area, location, advance rent, security deposit, rent-free days, and Sales' decision. No media. |
| **Business Leader** | `/business` | Final review, only after Sales and Ops approve. | Location, area, rent/month, security deposit, advance rent, rent-free days, photos/videos, and Sales' and Ops' decisions. |

Each person holds one role and is sent to that role's portal when they sign
in. Visibility is enforced on the server (`lib/expansion/workflow.ts` →
`STAGE_VISIBILITY`): hidden fields are never sent to the browser, and
`/api/media/:id` refuses photos/videos to roles that may not see them. To
change what a team sees, edit that table.

## The approval flow

1. **Real estate manager uploads** the property: name, owner name, address,
   Google Maps link (or coordinates), area, rent/month, security deposit,
   advance rent, lease tenure, rent escalation % per year, rent-free days,
   handover date, lock-in period, notes — then photos and videos (drag and
   drop, with upload progress). It's saved as a draft until they submit.
2. **Submit** → every Sales & Category member is notified.
3. **Sales approves or passes** (remarks required either way) → the real
   estate manager is notified. On approval, every Ops leader is notified.
4. **Ops approves or passes** → the real estate manager is notified. On
   approval, every Business Leader is notified that Sales and Ops approved.
5. **Business approves or passes** → the real estate manager is notified.
   Approved here means approved by all three teams.
6. A **pass** at any stage stops the property. The real estate manager can
   revise it and **resubmit**, which starts a new review round at Sales;
   earlier rounds' decisions stay in the history.

A property is locked while it's in review. The first person on a team to
decide records the decision for that team; if two people act at once, the
second is told it's already been decided. Notifications appear in-app (bell
in the header) and, if SMTP is configured, by email.

## Access management

- **Adding someone**: Access & roles → enter email, name, role → *Add & create
  invite*. This creates a one-time link (valid 7 days) that is emailed to
  them if SMTP is set up, and always shown to you to copy and share. They
  open it, choose a password, and land on their portal.
- **Changing a role** takes effect on their next page load.
- **Disabling** someone signs them out everywhere immediately.
- **Forgotten password**: *Reset password link* issues a new one-time link.
- You can't change your own role or disable yourself, and there must always
  be at least one active access manager.
- Five wrong passwords lock an account for 15 minutes.
- Every access change and every property action is recorded in an audit log
  (shown on Access & roles and on each property's admin page).

## Setup

Requires Node.js 22.13+ (it uses Node's built-in SQLite driver, so there's no
separate database server to run).

```bash
npm install
cp .env.example .env.local   # then edit: ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD, APP_URL
npm run dev                  # http://localhost:3000
```

On first start, the access manager account from `ADMIN_EMAIL` /
`ADMIN_INITIAL_PASSWORD` is created. Sign in with it, change the password
under **Account**, then add your team under **Access & roles**.

| Variable | Purpose |
|---|---|
| `APP_URL` | Public URL, used in invite links and emails. |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_INITIAL_PASSWORD` | First access manager (created once). |
| `DATA_DIR` | Where the database (`expansion.db`) and uploads live. Default `./data`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional email delivery. Without it, everything works in-app and you share invite links by hand. |
| `MAX_IMAGE_MB` (25), `MAX_VIDEO_MB` (500), `MAX_MEDIA_PER_PROPERTY` (40) | Upload limits. |
| `SESSION_DAYS` (7), `INVITE_DAYS` (7) | How long sign-ins and invite links last. |

Node prints an `ExperimentalWarning` for SQLite at startup; it's harmless.
Set `NODE_OPTIONS=--disable-warning=ExperimentalWarning` to silence it.

### Deploying

Run it as a normal long-lived Node server (`npm run build && npm start`) on a
VM, container or platform with a **persistent disk** mounted at `DATA_DIR`
(e.g. a Docker volume, Railway/Render disk, EC2/EBS). It won't keep data on
serverless hosts like Vercel, which have no persistent filesystem. Put it
behind HTTPS (session cookies are `Secure` in production), and **back up
`DATA_DIR`** regularly: it holds the database and every uploaded file.

Photos and videos are stored on that disk and only served through the
authenticated `/api/media` route. For many users or very large volumes of
video, the next step is moving the database to Postgres and media to S3 (or
similar). All data access goes through `lib/server/`, so that change stays
inside that folder.

## Code layout

- `lib/expansion/` — pure logic shared by server and UI: roles, the
  workflow state machine and visibility rules, form validation, Google Maps
  parsing, formatting.
- `lib/server/` — server-only data layer: SQLite schema and migrations
  (`db.ts`), users/invites/sign-in (`users.ts`), sessions (`session.ts`),
  properties and decisions (`properties.ts`), notifications, email, media
  storage, audit log.
- `app/(portal)/` — the role portals; `app/actions/` — server actions;
  `app/api/` — media upload/download and CSV export.
- `components/portal/` — portal UI.

```bash
npm test         # unit + integration tests (workflow, visibility, access control, calculator)
npm run lint
npm run build
```

## Electrical calculator (`/calculator`)

A calculator that estimates the count and cost of electrical assets needed
to fit out a new warehouse: lighting, fans, wiring/conduit, switches/sockets,
distribution hardware (MCBs, junction boxes, etc), site conditions, and
installation labour.

### How it works

1. **Calculator tab** — enter the warehouse area (and an optional name). The
   app computes a line-item list of required assets per category, with an
   editable unit cost per line, and shows category/grand totals.
2. **Formulas tab** — every quantity is derived from an editable ratio (e.g.
   "4.92 LED bulbs per 1000 sq ft") or, for a few items, a fixed count that
   didn't scale with area in the source data.

Inputs, formula ratios, and unit costs are saved to the browser's
`localStorage`, so they persist across reloads on the same device/browser.

### Calibration data

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

### Labour is single-site data, but confirmed to be a real separate cost

Labour is billed separately from materials at all three sites — Ashok Vihar
and Naraina's quotes were materials-only by design, not because installation
was free. Only Jahangirpuri's quote happened to itemize its labour cost (Rs
30,310, ~15% of that project's total), so the per-sqft labour rate is based
on that single data point and should be treated as a rough placeholder. Keep
this line in your estimate for the full cost of the rollout; set it to 0
only if you're tracking material and labour costs separately and don't want
this total to include labour.

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

### Getting more accurate results

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

### Calculator development notes

```bash
npm run dev      # start the dev server at http://localhost:3000
npm test         # run the calculation engine unit tests (includes a
                 # regression check against all three calibration sites)
npm run lint     # lint
npm run build    # production build
```

Calculation logic lives in `lib/calculator.ts`, the asset catalog and
calibrated defaults in `lib/config.ts`, and shared types in `lib/types.ts`.
