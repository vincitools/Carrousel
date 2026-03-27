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

export function buildMediaRecordData(shopId: string, result: any) {
  const isVideo = isLikelyVideo(result);

  return {
    shopId,
    status: "READY" as const,
    type: isVideo ? "VIDEO" as const : "IMAGE" as const,
    originalUrl: result.secure_url,
    thumbnailUrl: isVideo ? buildVideoThumbnailUrl(result) : result.secure_url,
    duration: Math.round(result.duration || 0),
  };
}
