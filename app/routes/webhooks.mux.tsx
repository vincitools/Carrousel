import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  buildMuxPlaybackUrl,
  buildMuxThumbnailUrl,
  extractPlaybackId,
  unwrapMuxWebhook,
} from "../services/mux.server";

/**
 * Mux webhook — configure in Mux Dashboard:
 * https://carrousel-pu4u.onrender.com/webhooks/mux
 *
 * Events: video.asset.ready, video.asset.errored, video.upload.asset_created, video.upload.errored
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await request.text();

  let event: { type?: string; data?: any };
  try {
    if (process.env.MUX_WEBHOOK_SECRET) {
      event = unwrapMuxWebhook(rawBody, request.headers) as any;
    } else {
      event = JSON.parse(rawBody);
      console.warn("[webhooks.mux] MUX_WEBHOOK_SECRET not set — skipping signature verification");
    }
  } catch (error) {
    console.error("[webhooks.mux] invalid webhook payload", error);
    return new Response("Invalid signature or payload", { status: 400 });
  }

  const type = String(event?.type || "");
  const data = event?.data || {};

  try {
    if (type === "video.upload.asset_created") {
      const uploadId = String(data.id || "");
      const assetId = String(data.asset_id || "");
      const passthrough = String(data.passthrough || "");

      if (uploadId || passthrough) {
        await prisma.video.updateMany({
          where: passthrough
            ? { id: passthrough }
            : { muxUploadId: uploadId },
          data: {
            muxAssetId: assetId || undefined,
            status: "PROCESSING",
          },
        });
      }
    }

    if (type === "video.asset.ready") {
      const assetId = String(data.id || "");
      const passthrough = String(data.passthrough || "");
      const playbackId = extractPlaybackId(data);
      const duration = Math.round(Number(data.duration) || 0);

      if (!playbackId) {
        console.warn("[webhooks.mux] asset ready without playback_id", assetId);
        return new Response("ok", { status: 200 });
      }

      const where = passthrough
        ? { id: passthrough }
        : assetId
          ? { muxAssetId: assetId }
          : null;

      if (!where) {
        console.warn("[webhooks.mux] asset ready with no matching key", { assetId, passthrough });
        return new Response("ok", { status: 200 });
      }

      // Asset ready — thumbnail works immediately; MP4 static rendition follows shortly.
      await prisma.video.updateMany({
        where,
        data: {
          muxAssetId: assetId || undefined,
          muxPlaybackId: playbackId,
          originalUrl: buildMuxPlaybackUrl(playbackId),
          thumbnailUrl: buildMuxThumbnailUrl(playbackId),
          duration: duration || undefined,
          status: "READY",
          type: "VIDEO",
        },
      });
    }

    if (type === "video.asset.static_rendition.ready") {
      const assetId = String(data.asset_id || data.id || "");
      const playbackIds = data.playback_ids || [];
      // Event may nest under data.static_rendition — find parent via asset_id
      let playbackId = extractPlaybackId(data);
      if (!playbackId && assetId) {
        const existing = await prisma.video.findFirst({
          where: { muxAssetId: assetId },
          select: { muxPlaybackId: true, id: true },
        });
        playbackId = existing?.muxPlaybackId || null;
        if (playbackId) {
          await prisma.video.updateMany({
            where: { muxAssetId: assetId },
            data: {
              originalUrl: buildMuxPlaybackUrl(playbackId),
              thumbnailUrl: buildMuxThumbnailUrl(playbackId),
              status: "READY",
            },
          });
        }
      } else if (playbackId) {
        await prisma.video.updateMany({
          where: playbackIds.length
            ? { muxPlaybackId: playbackId }
            : { muxAssetId: assetId },
          data: {
            originalUrl: buildMuxPlaybackUrl(playbackId),
            status: "READY",
          },
        });
      }
    }

    if (type === "video.asset.errored" || type === "video.upload.errored") {
      const passthrough = String(data.passthrough || "");
      const uploadId = String(data.id || "");
      const assetId = String(data.id || data.asset_id || "");

      if (passthrough) {
        await prisma.video.updateMany({
          where: { id: passthrough },
          data: { status: "FAILED" },
        });
      } else if (uploadId || assetId) {
        await prisma.video.updateMany({
          where: {
            OR: [
              ...(uploadId ? [{ muxUploadId: uploadId }] : []),
              ...(assetId ? [{ muxAssetId: assetId }] : []),
            ],
          },
          data: { status: "FAILED" },
        });
      }
    }
  } catch (error) {
    console.error("[webhooks.mux] handler error", type, error);
    // Still 200 so Mux doesn't hammer retries for app bugs; log for ops.
  }

  return new Response("ok", { status: 200 });
};

export const loader = async () => new Response("Mux webhook endpoint", { status: 200 });
