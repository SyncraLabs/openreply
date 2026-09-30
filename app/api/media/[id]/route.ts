import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

type RouteProps = { params: Promise<{ id: string }> };

// Public by design: Instagram fetches the file from here when it delivers the
// message, and the file goes to everyone who triggers the campaign anyway.
// The extension in the URL is cosmetic.
export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { id } = await params;
  const assetId = id.split(".")[0];

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { data: true, contentType: true, size: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Never let an uploaded file run as a page on our origin.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
