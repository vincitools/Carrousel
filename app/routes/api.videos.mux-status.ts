import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireShop } from "../utils/requireShop.server";
import {
  buildMuxPlaybackUrl,
  buildMuxThumbnailUrl,
  extractPlaybackId,
  getMuxAsset,
  getMuxConfigIssue,
  getMuxUpload,
} from "../services/mux.server";

/**
 * Poll Mux until the uploaded video is ready (backup when webhook is delayed).
 * GET/POST /api/videos.mux-status?id=<videoId>
 */
async function syncMuxVideo(videoId: string, shopId: string) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, shopId },
  });

  if (!video) {
    return { error: "Not found", status: 404 as const };
  }

  if (video.status === "READY" && video.muxPlaybackId && video.originalUrl) {
    return {
      status: "READY" as const,
      video: {
        id: video.id,
        url: video.originalUrl,
        thumbnail: video.thumbnailUrl,
        duration: video.duration,
        type: video.type,
      },
    };
  }

  const muxIssue = getMuxConfigIssue();
  if (muxIssue) {
    return { error: muxIssue, status: 500 as const };
  }

  let assetId = video.muxAssetId;

  if (!assetId && video.muxUploadId) {
    const upload = await getMuxUpload(video.muxUploadId);
    assetId = upload.asset_id || null;
    if (assetId) {
      await prisma.video.update({
        where: { id: video.id },
        data: { muxAssetId: assetId },
      });
    }
    if (upload.status === "errored" || upload.status === "cancelled") {
      await prisma.video.update({
        where: { id: video.id },
        data: { status: "FAILED" },
      });
      return { status: "FAILED" as const, video: { id: video.id } };
    }
  }

  if (!assetId) {
    return { status: "PROCESSING" as const, video: { id: video.id } };
  }

  const asset = await getMuxAsset(assetId);
  const playbackId = extractPlaybackId(asset);

  if (asset.status === "errored") {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "FAILED", muxAssetId: assetId },
    });
    return { status: "FAILED" as const, video: { id: video.id } };
  }

  if (asset.status === "ready" && playbackId) {
    const duration = Math.round(Number(asset.duration) || 0);
    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        muxAssetId: assetId,
        muxPlaybackId: playbackId,
        originalUrl: buildMuxPlaybackUrl(playbackId),
        thumbnailUrl: buildMuxThumbnailUrl(playbackId),
        duration: duration || undefined,
        status: "READY",
        type: "VIDEO",
      },
    });

    return {
      status: "READY" as const,
      video: {
        id: updated.id,
        url: updated.originalUrl,
        thumbnail: updated.thumbnailUrl,
        duration: updated.duration,
        type: updated.type,
      },
    };
  }

  return { status: "PROCESSING" as const, video: { id: video.id } };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await requireShop(request);
    const url = new URL(request.url);
    const videoId = String(url.searchParams.get("id") || "").trim();
    if (!videoId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const result = await syncMuxVideo(videoId, shop.id);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.videos.mux-status] loader failed", error);
    return Response.json({ error: "Failed to check Mux status" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop } = await requireShop(request);
    const form = await request.formData();
    const videoId = String(form.get("id") || "").trim();
    if (!videoId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const result = await syncMuxVideo(videoId, shop.id);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.videos.mux-status] action failed", error);
    return Response.json({ error: "Failed to check Mux status" }, { status: 500 });
  }
};
