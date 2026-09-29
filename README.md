# Expansion Portal

An in-house platform that runs the expansion pipeline end to end: a real
estate manager scouts a property, it's approved by the Expansion Manager,
Business Leaders, Sales and Ops, the owner's documents and the LOI are
collected, the Founder gives final approval, and Finance releases the
token, the balance and any stamp duty — with every document, decision and
payment stored permanently and visible to the right people. The warehouse
electrical asset calculator lives at `/calculator` in the same app.

## The pipeline

| # | Stage | Who acts | What happens | Who is notified |
|---|---|---|---|---|
| 1 | Expansion Manager review | Expansion Manager | Approve or reject, with remarks | Real estate manager; on approval, Business Leaders |
| 2 | Business Leaders review | Business Leaders | Approve, hold or reject, with remarks | Expansion Manager and real estate manager; on approval, the whole Sales team |
| 3 | Sales review | Designated sales approvers | Only sales members given approval access vote approve/reject with remarks; the stage resolves when enough agree (setting, default 1). The rest of the sales team can view | Real estate manager on every vote; Expansion Manager when it resolves; on approval, Ops |
| 4 | Ops site visit | Ops | Upload site photos/videos, mark visited, write the scope of work, approve or reject | Real estate manager and Expansion Manager |
| 5 | Owner & property documents | Real estate manager | Owners (one or more) with Aadhaar front/back, PAN, contact and bank details; electricity bill, lease deed / registered document / power of attorney, property tax receipt, GST (if an organisation), and optional water bill, rent agreement, tenant NOC, other | Expansion Manager |
| 6 | LOI issued | Expansion Manager | Upload the LOI; it's emailed to every owner with an email address | Real estate manager (to get it signed) |
| 7 | Signed LOI | Expansion Manager | Upload the signed LOI | Founder |
| 8 | Founder approval | Founder | Approve, hold or reject, seeing everything | Expansion Manager and real estate manager; on approval, Finance |
| 9 | Token released | Finance | Upload the UTR receipt, enter amount/UTR/date, mark paid | Expansion Manager and Founder |
| 10 | Signed agreement | Expansion Manager | Upload the agreement (notarised / ₹100 stamp paper, signed with the Founder) | Finance, Founder |
| 11 | Balance released | Finance | Sees the agreement, landlord bank details and the token payment; pays the remainder, marks paid with UTR and receipt | Expansion Manager and Founder |
| — | Stamp duty (optional) | Access Manager or Expansion Manager → Finance | Any time after the Founder approves: request stamp duty with the calculation PDF; Finance pays and marks paid with UTR | Finance and Founder; then Expansion Manager and Founder |

- **Remarks are required** for every approve, hold and reject, and every
  decision is recorded with the person's name and time.
- **Hold** keeps the property with that team until they approve or reject.
- **Rejected** properties go back to the real estate manager, who can revise
  and resubmit; that starts a new round at stage 1, and earlier rounds stay
  in the history.
- Actions are checked on the server against the property's current stage,
  so two people can't both move the same property.

## Roles and what they see

| Role | Portal | Sees |
|---|---|---|
| Access Manager (admin) | `/admin` | Everything; manages people, roles, backups and settings |
| Expansion Manager | `/expansion` | Complete dashboard: every property, all details, media, documents, decisions and payments |
| Real Estate Manager | `/real-estate` | Everything about their own properties (payment status but not Finance's receipts) |
| Business Leader | `/business` | Store name, total/carpet area, asking rent, security deposit, rent-free period, advance rent, and decisions |
| Sales Team | `/sales` | All property details, location and photos/videos (not owner documents). Only members with **approval access** (set per person on Access & roles) can approve or reject; the rest view |
| Ops Team | `/ops` | All property details and media, plus the site visit they record |
| Founder | `/founder` | Everything, including KYC documents and payments |
| Finance | `/finance` | Store name, address, area, advance rent, security deposit, decisions, signed LOI, agreement, owner names and bank details, payments and receipts (not Aadhaar/PAN or property documents) |

These rules live in `lib/expansion/workflow.ts` (`FIELD_VISIBILITY`,
`CATEGORY_INFO`, `ACCESS_FROM`) and are enforced on the server: hidden fields
are never sent to the browser, and `/api/files/:id` refuses a file to any
role not allowed to see that document type. Each team only sees a property
once it has reached them.

## How data is kept safe ("never lose it")

1. **Nothing is deleted.** The database itself refuses to delete properties,
   owners, files, decisions, payments, users or audit entries (SQLite
   triggers), and decisions and audit entries can't be edited. Removing or
   replacing a document *archives* it: it disappears from normal views but
   stays in storage and is listed under "Archived files" for the access
   manager, Expansion Manager and Founder.
2. **Every file is fingerprinted.** Each upload's SHA-256 is recorded;
   *Backups & settings → Verify all files* re-reads every file and checks it.
   Uploads are also checked to really be the type they claim (PDF, image,
   video, .docx).
3. **Off-site copy of every file.** With an S3-compatible bucket configured
   (AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO…), every file is copied
   there as it's uploaded. If the server's copy is ever lost, it's restored
   from the bucket automatically the next time someone opens it. Failed
   copies are retried with every backup.
4. **Automatic database backups** every `BACKUP_INTERVAL_HOURS` (default 6)
   to `BACKUP_DIR` and the bucket. The last `BACKUP_KEEP` (default 60) are
   kept locally; the app never deletes bucket copies.
5. **Audit log** of every action, shown on each property and on Access &
   roles.

For the strongest protection, turn on **versioning** (and ideally object
lock) on the bucket, so even a mistaken overwrite can be undone, and keep
the bucket in a different account/region from the server.

**Restoring the database** from a backup: stop the app, copy the backup
file (from `BACKUP_DIR` or the bucket's `backups/` folder) to
`DATA_DIR/expansion.db`, delete `expansion.db-wal` and `expansion.db-shm`
if present, and start the app. Uploaded files are restored from the bucket
on demand.

## Access management

- **Adding someone**: Access & roles → email, name, role → *Add & create
  invite*. A one-time link (valid 7 days) is emailed if SMTP is set up and
  always shown to copy. They choose a password and land on their portal.
- **Changing a role** takes effect on their next page load; **disabling**
  signs them out everywhere immediately; **reset password link** issues a
  new one-time link.
- You can't change your own role or disable yourself, and there's always at
  least one active access manager. Five wrong passwords lock an account for
  15 minutes.

## Setup

Requires Node.js 22.13+ (it uses Node's built-in SQLite driver, so there's
no separate database server).

```bash
npm install
cp .env.example .env.local   # set ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD, APP_URL, and S3_* for off-site copies
npm run dev                  # http://localhost:3000
```

On first start the access manager from `ADMIN_EMAIL` /
`ADMIN_INITIAL_PASSWORD` is created. Sign in, change the password under
**Account**, then add your team under **Access & roles**.

| Variable | Purpose |
|---|---|
| `APP_URL` | Public URL, used in invite links and emails |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_INITIAL_PASSWORD` | First access manager (created once) |
| `DATA_DIR` | Database and uploaded files (default `./data`) |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX`, `S3_FORCE_PATH_STYLE` | Off-site copy of every file and backup (strongly recommended) |
| `BACKUP_DIR`, `BACKUP_INTERVAL_HOURS` (6), `BACKUP_KEEP` (60) | Database backups; point `BACKUP_DIR` at a second disk if you have one |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email for invites, notifications and sending the LOI to landowners. Without it everything works in-app, and LOIs are downloaded and sent by hand |
| `MAX_IMAGE_MB` (25), `MAX_VIDEO_MB` (500), `MAX_DOCUMENT_MB` (25), `MAX_FILES_PER_PROPERTY` (300) | Upload limits |
| `SESSION_DAYS` (7), `INVITE_DAYS` (7) | Sign-in and invite link lifetimes |

Node prints an `ExperimentalWarning` for SQLite at startup; it's harmless
(`NODE_OPTIONS=--disable-warning=ExperimentalWarning` silences it).

## Demo environment (for walkthroughs)

With `DEMO_MODE=true` — and automatically on Vercel — the portal runs as a
demo:

- nine sample accounts, one per role plus a view-only sales member, all
  with password `Demo@12345`, listed on the sign-in page for one-click
  sign-in;
- eight sample properties seeded at different stages (new, rejected, on
  hold, awaiting Sales, awaiting documents, awaiting the Founder, awaiting
  the agreement with stamp duty requested, and fully completed);
- an amber banner saying data resets, and uploads capped at 4 MB (Vercel's
  request limit).

Vercel's disk is temporary, so anything added in the demo disappears when
Vercel recycles the server. Use it to show the flow, never for real
documents; the portal refuses to run on Vercel outside demo mode.

## Going live

It needs a long-running Node server with a **persistent disk** and HTTPS.
Serverless hosts like Vercel have no persistent disk and won't work.

### 1. Create the off-site bucket (do this first)

Cloudflare R2 is the simplest and has no download fees; AWS S3 in
`ap-south-1` (Mumbai) works equally well.

- **R2:** Cloudflare dashboard → R2 → Create bucket (e.g.
  `fairdeal-expansion-portal`) → Manage R2 API tokens → create a token with
  *Object Read & Write* on that bucket. Note the access key ID, secret and
  the S3 endpoint `https://<account-id>.r2.cloudflarestorage.com`. Set
  `S3_REGION=auto`.
- **AWS S3:** create the bucket with **Versioning enabled**, then an IAM
  user with `s3:PutObject`, `s3:GetObject` and `s3:ListBucket` on it. Leave
  `S3_ENDPOINT` empty.

### 2. Email (for invites, notifications and LOIs)

Any SMTP account works. For Google Workspace: create (or pick) a mailbox
such as `expansion@yourcompany.com`, turn on 2-step verification, create an
*App password*, and use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
`SMTP_USER`/`SMTP_FROM` = that address, `SMTP_PASS` = the app password.

### 3a. Deploy on Render (recommended, ~10 minutes)

`render.yaml` in this repo describes the service, including a 20 GB
persistent disk, the health check and automatic deploys.

1. render.com → **New → Blueprint** → connect GitHub → pick this repo and
   the default branch.
2. Fill in the values it asks for: `APP_URL` (e.g.
   `https://expansion-portal.onrender.com`, or your own domain),
   `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_INITIAL_PASSWORD`, the `S3_*` values
   from step 1 and the `SMTP_*` values from step 2. Leave any you don't use
   empty.
3. **Apply.** The first deploy takes a few minutes. The Starter instance plus
   the disk costs roughly US$7–10/month.
4. Optional: Settings → Custom Domains → add e.g.
   `expansion.yourcompany.com` and create the CNAME it shows; then update
   `APP_URL` to match.

### 3b. Or any server with Docker

```bash
cp .env.example .env    # fill it in; DATA_DIR is set to /data in the image
docker compose up -d --build
```

Put it behind HTTPS (Caddy: `expansion.yourcompany.com { reverse_proxy localhost:3000 }`).
The `portal-data` volume holds the database, uploads and local backups.

### 4. First sign-in

Open the site, sign in with `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`,
change the password under **Account**, then:

- **Access & roles:** add each person with their role. For sales, tick *Can
  approve* for the members who approve.
- **Backups & settings:** confirm "Off-site bucket" shows your bucket, click
  **Back up now**, and check the backup is marked ✓ off-site.

`/api/health` returns `{"ok":true}` when the app and database are up; point
an uptime monitor (e.g. UptimeRobot) at it.

## Code layout

- `lib/expansion/` — pure rules shared by server and UI: roles, the
  pipeline and visibility tables (`workflow.ts`), form validation, maps,
  formatting.
- `lib/server/` — server-only data layer: schema and migrations (`db.ts`),
  property access and views (`properties.ts`), every pipeline step
  (`pipeline.ts`), uploads (`files.ts`), local + S3 storage
  (`blobStore.ts`), backups, users, sessions, notifications, email, audit,
  settings.
- `app/(portal)/` — role portals and the shared property page
  (`/properties/[id]`), which shows each role its sections and actions;
  `app/actions/` — server actions; `app/api/` — file upload/download, CSV
  export; `instrumentation.ts` starts the backup scheduler.

```bash
npm test         # pipeline, visibility, archiving, backups, access control, calculator
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
