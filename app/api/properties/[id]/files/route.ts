import { NextRequest, NextResponse } from "next/server";
import { isFileCategory } from "@/lib/expansion/workflow";
import { saveUpload } from "@/lib/server/files";
import { PropertyError } from "@/lib/server/properties";
import { currentUser } from "@/lib/server/session";

// One file per request, streamed straight to disk (videos can be hundreds
// of MB). The body is the raw file; ?category= says what it is, ?owner= which
// owner a KYC document belongs to, and X-File-Name carries its name.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/properties/[id]/files">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await ctx.params;
  const category = request.nextUrl.searchParams.get("category");
  const owner = request.nextUrl.searchParams.get("owner");
  if (!isFileCategory(category)) return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: "No file received." }, { status: 400 });

  let name = "upload";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "upload");
  } catch {
    // Keep the default name.
  }
  const length = request.headers.get("content-length");
  try {
    const file = await saveUpload(user, Number(id), {
      category,
      ownerId: owner ? Number(owner) : null,
      mime: request.headers.get("content-type") ?? "",
      originalName: name,
      declaredSize: length ? Number(length) : null,
      body: request.body,
    });
    return NextResponse.json(file, { status: 201 });
  } catch (error) {
    if (error instanceof PropertyError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[upload] failed", error);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
