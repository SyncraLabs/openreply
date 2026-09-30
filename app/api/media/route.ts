import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { ALLOWED_MEDIA, MAX_UPLOAD_BYTES } from "@/lib/media";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

// Upload a file for a campaign sequence message. Returns the public URL
// Instagram will fetch it from.
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can upload files" },
      { status: 403 }
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    file = null;
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "No file received" },
      { status: 400 }
    );
  }

  const extension = ALLOWED_MEDIA[file.type];
  if (!extension) {
    return NextResponse.json(
      {
        success: false,
        error: "Use PNG or JPEG, AAC/M4A/WAV audio, MP4/MOV/WebM video, or PDF",
      },
      { status: 400 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: "Max 4 MB per upload. For bigger files, paste a public URL instead",
      },
      { status: 400 }
    );
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId: context.workspaceId,
      filename: file.name.slice(0, 200),
      contentType: file.type,
      size: file.size,
      data: new Uint8Array(await file.arrayBuffer()),
    },
    select: { id: true },
  });

  return NextResponse.json(
    {
      success: true,
      data: { url: `${getBaseUrl()}/api/media/${asset.id}.${extension}` },
    },
    { status: 201 }
  );
}
