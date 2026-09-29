import { backupIsStale } from "@/lib/server/backups";
import { db } from "@/lib/server/db";

// For the host's health check and uptime monitors. Reveals nothing private.
export async function GET() {
  try {
    db().prepare("SELECT 1").get();
    return Response.json({ ok: true, backupStale: backupIsStale() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
