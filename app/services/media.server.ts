export const VIDEO_FORMATS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv"]);

export function isLikelyVideo(result: any) {
  const resourceType = String(result?.resource_type || "").toLowerCase();
  const format = String(result?.format || "").toLowerCase();
  return resourceType === "video" || VIDEO_FORMATS.has(format);
}

export function buildVideoThumbnailUrl(result: any) {
  if (result?.public_id && process.env.CLOUDINARY_CLOUD_NAME) {
    return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/so_1/${result.public_id}.jpg`;
  }

  const secureUrl = String(result?.secure_url || "");
  if (!secureUrl) return null;

  const withTransformation = secureUrl.includes("/video/upload/")
    ? secureUrl.replace("/video/upload/", "/video/upload/so_1/")
    : secureUrl.replace("/upload/", "/upload/so_1/");

  return withTransformation.replace(/\.(mp4|mov|webm|m4v|avi|mkv)(\?.*)?$/i, ".jpg$2");
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").trim();
}

export function titleFromFileName(fileName: string) {
  return stripExtension(String(fileName || "")) || "Untitled media";
}

/** Random Cloudinary public_ids and app-generated ids — not suitable as display titles. */
export function looksLikeGeneratedMediaId(value: string) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/\s/.test(v)) return false;
  if (v.startsWith("shopify-")) return true;
  if (v.length >= 14 && /^[a-z0-9_-]+$/i.test(v) && !v.includes(".")) {
    const segments = v.split(/[-_]/).filter(Boolean);
    if (segments.length >= 2 && segments.every((segment) => segment.length <= 14)) {
      return false;
    }
    return true;
  }
  return false;
}

function resolveMediaTitle(result: any, originalFileName?: string | null) {
  const fromUpload = titleFromFileName(originalFileName || "");
  if (fromUpload !== "Untitled media") return fromUpload;

  const fromCloudinary = stripExtension(String(result?.original_filename || ""));
  if (fromCloudinary && !looksLikeGeneratedMediaId(fromCloudinary)) return fromCloudinary;

  return "Untitled media";
}

/** Title safe to show in admin UI (stored title or upload filename). */
export function resolveDisplayTitle(storedTitle?: string | null, originalFileName?: string | null) {
  const stored = String(storedTitle || "").trim();
  if (stored && !looksLikeGeneratedMediaId(stored)) return stored;

  const fromFile = titleFromFileName(originalFileName || "");
  if (fromFile !== "Untitled media") return fromFile;

  return "Untitled media";
}

export function buildMediaRecordData(shopId: string, result: any, originalFileName?: string | null) {
  const isVideo = isLikelyVideo(result);

  return {
    shopId,
    status: "READY" as const,
    type: isVideo ? "VIDEO" as const : "IMAGE" as const,
    title: resolveMediaTitle(result, originalFileName),
    originalUrl: result.secure_url,
    thumbnailUrl: isVideo ? buildVideoThumbnailUrl(result) : result.secure_url,
    duration: Math.round(result.duration || 0),
  };
}
