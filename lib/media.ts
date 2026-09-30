import type { StepType } from "@/lib/sequence";

// File types Instagram accepts as DM attachments, by sequence step type.
export const MEDIA_TYPES: Record<Exclude<StepType, "text">, Record<string, string>> = {
  image: { "image/png": "png", "image/jpeg": "jpg" },
  audio: {
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
  },
  video: {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/ogg": "ogg",
    "video/x-msvideo": "avi",
  },
  file: { "application/pdf": "pdf" },
};

export const ALLOWED_MEDIA: Record<string, string> = Object.assign(
  {},
  ...Object.values(MEDIA_TYPES)
);

// Vercel refuses request bodies over 4.5 MB, so uploads stop just below it.
// Bigger files (long videos) go in by URL.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
