import prisma from "../db.server";
import type { ActionFunction } from "react-router";
import { buildMediaRecordData, isLikelyVideo } from "../services/media.server";
import { requireShopDev } from "../utils/requireShopDev.server";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const uploadDebugLogPath = resolve(process.cwd(), "upload-debug.log");

function logFinalize(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    appendFileSync(uploadDebugLogPath, `${line}\n`, "utf8");
  } catch (error) {
    console.error("[finalize-log] failed writing upload-debug.log", error);
  }
}

export const action: ActionFunction = async ({ request }) => {
  const requestId = `finalize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  logFinalize(`[${requestId}] /api/videos/finalize hit`);
  logFinalize(`[${requestId}] content-type=${request.headers.get("content-type") || "unknown"}`);

  try {
    const { shop } = await requireShopDev();
    logFinalize(`[${requestId}] shopId=${shop.id}`);
    const form = await request.formData();
    const cloudinaryResult = form.get("result");

    if (!cloudinaryResult || typeof cloudinaryResult !== "string") {
      logFinalize(`[${requestId}] missing result field`);
      return Response.json(
        { error: "Cloudinary result is required" },
        { status: 400 }
      );
    }

    const result = JSON.parse(cloudinaryResult);
    logFinalize(`[${requestId}] cloudinary secure_url=${result?.secure_url || "n/a"}`);
    const isVideo = isLikelyVideo(result);
    const mediaData = buildMediaRecordData(shop.id, result);

    logFinalize(
      `[${requestId}] detected type=${mediaData.type} resource_type=${result?.resource_type || "n/a"} format=${result?.format || "n/a"}`
    );
    const video = await prisma.video.create({
      data: mediaData,
    });
    logFinalize(`[${requestId}] prisma.video created id=${video.id}`);
    logFinalize(`[${requestId}] done in ${Date.now() - startedAt}ms`);

    return Response.json({
      success: true,
      video: {
        id: video.id,
        url: video.originalUrl,
        thumbnail: video.thumbnailUrl,
        duration: video.duration,
        type: video.type,
      },
    });
  } catch (error) {
    logFinalize(`[${requestId}] FINALIZE ERROR: ${String(error)}`);
    logFinalize(`[${requestId}] failed after ${Date.now() - startedAt}ms`);
    return new Response(JSON.stringify({ error: "Finalize failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
