import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getWardrobeMode } from "../../../lib/wardrobe-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_PATH_PATTERN = /^content\/photos\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i;

export async function GET(request: Request) {
  if (getWardrobeMode() === "demo") {
    return NextResponse.json({ error: "Demo mode uses bundled sample illustrations." }, { status: 404 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is unavailable." }, { status: 503 });
  }

  const pathname = new URL(request.url).searchParams.get("path") ?? "";
  if (!PHOTO_PATH_PATTERN.test(pathname)) {
    return NextResponse.json({ error: "Invalid wardrobe photo path." }, { status: 400 });
  }

  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }
    return new Response(result.stream, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": result.blob.contentType,
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load the wardrobe photo." }, { status: 503 });
  }
}
