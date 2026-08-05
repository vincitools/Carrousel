import prisma from "../db.server";
import { v2 as cloudinary } from "cloudinary";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireShop } from "../utils/requireShop.server";
import { titleFromFileName } from "../services/media.server";
import {
  createMuxDirectUpload,
  getMuxConfigIssue,
} from "../services/mux.server";
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
    return "Cloudinary env vars missing (still required for image uploads)";
  }

  if (cloudName === "ml_default") {
    return "CLOUDINARY_CLOUD_NAME is invalid. 'ml_default' is usually an upload preset, not your account cloud name.";
  }

  return null;
}

function normalizeMediaType(value: string | null) {
  return value === "image" ? "image" : "video";
}

async function buildCloudinarySignedUpload(shopId: string) {
  const publicId = `shopify-${shopId}-${Date.now()}`;
  const timestamp = Math.round(new Date().getTime() / 1000);
  const uploadParams = {
    folder: "shopify-videos",
    public_id: publicId,
    timestamp,
  };
  const signature = cloudinary.utils.api_sign_request(
    uploadParams,
    process.env.CLOUDINARY_API_SECRET!,
  );
  const uploadURL = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;

  return {
    provider: "cloudinary" as const,
    uploadURL,
    uploadParams: {
      ...uploadParams,
      signature,
      api_key: process.env.CLOUDINARY_API_KEY,
    },
    videoId: publicId,
  };
}

async function buildMuxSignedUpload(shopId: string, title: string) {
  const video = await prisma.video.create({
    data: {
      shopId,
      title: title || "Untitled media",
      status: "PROCESSING",
      type: "VIDEO",
    },
  });

  const upload = await createMuxDirectUpload(video.id);

  await prisma.video.update({
    where: { id: video.id },
    data: { muxUploadId: upload.uploadId },
  });

  return {
    provider: "mux" as const,
    uploadURL: upload.uploadURL,
    uploadParams: {},
    videoId: video.id,
    uploadId: upload.uploadId,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestId = `upload-loader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  logUpload(`[${requestId}] /api/videos/upload loader hit method=${request.method}`);

  try {
    const { shop } = await requireShop(request);
    const url = new URL(request.url);
    const mediaType = normalizeMediaType(url.searchParams.get("mediaType"));
    const titleHint = String(url.searchParams.get("title") || "").trim();

    if (mediaType === "image") {
      const cloudinaryIssue = getCloudinaryConfigIssue();
      if (cloudinaryIssue) {
        logUpload(`[${requestId}] ${cloudinaryIssue}`);
        return Response.json({ error: cloudinaryIssue }, { status: 500 });
      }
      const signedUpload = await buildCloudinarySignedUpload(shop.id);
      logUpload(`[${requestId}] cloudinary image params generated`);
      return Response.json(signedUpload);
    }

    const muxIssue = getMuxConfigIssue();
    if (muxIssue) {
      logUpload(`[${requestId}] ${muxIssue}`);
      return Response.json({ error: muxIssue }, { status: 500 });
    }

    const signedUpload = await buildMuxSignedUpload(
      shop.id,
      titleHint || "Untitled media",
    );
    logUpload(
      `[${requestId}] mux upload created videoId=${signedUpload.videoId} uploadId=${signedUpload.uploadId}`,
    );
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
  logUpload(`[${requestId}] /api/videos/upload hit method=${request.method}`);

  try {
    const { shop } = await requireShop(request);
    const url = new URL(request.url);
    const mediaType = normalizeMediaType(url.searchParams.get("mediaType"));
    const titleHint = String(url.searchParams.get("title") || "").trim();

    // Multipart server-side upload is no longer used for Mux (client PUTs directly).
    // Keep image path via signed params only.
    if (mediaType === "image") {
      const cloudinaryIssue = getCloudinaryConfigIssue();
      if (cloudinaryIssue) {
        return Response.json({ error: cloudinaryIssue }, { status: 500 });
      }
      return Response.json(await buildCloudinarySignedUpload(shop.id));
    }

    const muxIssue = getMuxConfigIssue();
    if (muxIssue) {
      return Response.json({ error: muxIssue }, { status: 500 });
    }

    // Optional: if a file name was posted as form field, use it as title
    let title = titleHint;
    try {
      const formData = await request.formData();
      const fileName = String(formData.get("fileName") || formData.get("originalFileName") || "").trim();
      if (fileName) title = titleFromFileName(fileName);
    } catch {
      // no form body — fine
    }

    const signedUpload = await buildMuxSignedUpload(shop.id, title || "Untitled media");
    return Response.json(signedUpload);
  } catch (error) {
    if (error instanceof Response) throw error;
    logUpload(`[${requestId}] UPLOAD ERROR: ${String(error)}`);
    return Response.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
};
