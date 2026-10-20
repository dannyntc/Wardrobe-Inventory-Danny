import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getWardrobeMode } from "../../../lib/wardrobe-mode";

export const runtime = "nodejs";

const PHOTO_PREFIX = "content/photos/";
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function isPhotoPath(pathname: string) {
  return new RegExp(`^${PHOTO_PREFIX.replace("/", "\\/")}[a-zA-Z0-9_-]+\\.(?:jpe?g|png|webp)$`, "i").test(pathname);
}

export async function POST(request: Request) {
  if (getWardrobeMode() === "demo") {
    return NextResponse.json({ error: "Photo uploads are disabled in the public demo." }, { status: 404 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is unavailable." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!isPhotoPath(pathname)) throw new Error("Invalid wardrobe photo path.");
        return {
          allowedContentTypes: [...PHOTO_TYPES],
          maximumSizeInBytes: MAX_PHOTO_SIZE,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare the photo upload." },
      { status: 400 },
    );
  }
}
