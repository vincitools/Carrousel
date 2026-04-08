
import prisma from "../db.server";
import { v2 as cloudinary } from "cloudinary";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireShop } from "../utils/requireShop.server";
import { uploadVideo } from "../services/cloudinary.server";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const uploadDebugLogPath = resolve(process.cwd(), "upload-debug.log");

function logUpload(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    appendFileSync(uploadDebugLogPath, `${line}\n`, "utf8");
  } catch (error) {
    console.error("[upload-log] failed writing upload-debug.log", error);
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

function getCloudinaryConfigIssue() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return "Cloudinary env vars missing";
  }

  if (cloudName === "ml_default") {
    return "CLOUDINARY_CLOUD_NAME is invalid. 'ml_default' is usually an upload preset, not your account cloud name.";
  }

  return null;
}

function normalizeMediaType(value: string | null) {
  return value === "image" ? "image" : "video";
}

function titleFromFileName(fileName: string) {
  return String(fileName || "").replace(/\.[^/.]+$/, "").trim() || "Untitled media";
}

async function buildSignedUpload(shopId: string, mediaType: "video" | "image") {
  const publicId = `shopify-${shopId}-${Date.now()}`;
  const timestamp = Math.round(new Date().getTime() / 1000);
  const uploadParams = {
    folder: "shopify-videos",
    public_id: publicId,
    timestamp,
  };
  const signature = cloudinary.utils.api_sign_request(uploadParams, process.env.CLOUDINARY_API_SECRET!);
  const uploadURL = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${mediaType}/upload`;

  return {
    uploadURL,
    uploadParams: {
      ...uploadParams,
      signature,
      api_key: process.env.CLOUDINARY_API_KEY,
    },
    videoId: publicId,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestId = `upload-loader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  logUpload(`[${requestId}] /api/videos/upload loader hit method=${request.method}`);

  try {
    const { shop } = await requireShop(request);
    const url = new URL(request.url);
    const mediaType = normalizeMediaType(url.searchParams.get("mediaType"));
    const cloudinaryIssue = getCloudinaryConfigIssue();
    if (cloudinaryIssue) {
      logUpload(`[${requestId}] ${cloudinaryIssue}`);
      return Response.json({ error: cloudinaryIssue }, { status: 500 });
    }

    const signedUpload = await buildSignedUpload(shop.id, mediaType);
    logUpload(`[${requestId}] signed params generated videoId=${signedUpload.videoId} mediaType=${mediaType}`);
    return Response.json(signedUpload);
  } catch (error) {
    if (error instanceof Response) {
      logUpload(`[${requestId}] LOADER AUTH RESPONSE status=${error.status}`);
      throw error;
    }

    logUpload(`[${requestId}] LOADER ERROR: ${String(error)}`);
    return Response.json({ error: "Failed to generate upload params" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const requestId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  logUpload(`[${requestId}] /api/videos/upload hit`);
  logUpload(`[${requestId}] method=${request.method}`);
  logUpload(`[${requestId}] content-type=${request.headers.get("content-type") || "unknown"}`);

  try {
    const { shop } = await requireShop(request);
    const url = new URL(request.url);
    const mediaType = normalizeMediaType(url.searchParams.get("mediaType"));
    logUpload(`[${requestId}] shopId=${shop.id}`);
    const cloudinaryIssue = getCloudinaryConfigIssue();
    if (cloudinaryIssue) {
      logUpload(`[${requestId}] ${cloudinaryIssue}`);
      return Response.json({ error: cloudinaryIssue }, { status: 500 });
    }

    logUpload(`[${requestId}] parsing formData`);
    const formData = await request.formData();
    const file = formData.get("file");
    logUpload(`[${requestId}] file field present=${Boolean(file)}`);

    if (file && typeof file !== "string") {
      logUpload(`[${requestId}] file name=${file.name} size=${file.size} type=${file.type}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      logUpload(`[${requestId}] file buffer ready bytes=${buffer.length}`);

      logUpload(`[${requestId}] uploading to Cloudinary`);
      const result = (await uploadVideo(buffer)) as any;
      logUpload(`[${requestId}] Cloudinary upload success public_id=${result?.public_id || "n/a"}`);
      const type = result.resource_type === "video" ? "VIDEO" : "IMAGE";

      logUpload(`[${requestId}] creating prisma.video`);
      const video = await prisma.video.create({
        data: {
          shopId: shop.id,
          title: titleFromFileName(file.name),
          status: "READY",
          type,
          originalUrl: result.secure_url,
          thumbnailUrl:
            result.resource_type === "video"
              ? result.secure_url.replace("/upload/", "/upload/so_1/")
              : result.secure_url,
          duration: Math.round(result.duration || 0),
        },
      });
      logUpload(`[${requestId}] prisma.video created id=${video.id}`);
      logUpload(`[${requestId}] done in ${Date.now() - startedAt}ms`);

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
    }

    logUpload(`[${requestId}] no multipart file found, returning signed upload params`);
    const signedUpload = await buildSignedUpload(shop.id, mediaType);
    return Response.json(signedUpload);
  } catch (error) {
    if (error instanceof Response) {
      logUpload(`[${requestId}] ACTION AUTH RESPONSE status=${error.status}`);
      throw error;
    }

    logUpload(`[${requestId}] UPLOAD ERROR: ${String(error)}`);
    logUpload(`[${requestId}] failed after ${Date.now() - startedAt}ms`);
    return new Response(JSON.stringify({ error: "Failed to generate upload URL" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};