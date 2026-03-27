import { v2 as cloudinary } from "cloudinary";
import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { buildMediaRecordData } from "../services/media.server";
import { requireShopDev } from "../utils/requireShopDev.server";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|webm|m4v|avi|mkv)(\?.*)?$/i;
const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i;

function getDirectUrlValidationError(targetUrl: URL) {
  if (targetUrl.protocol !== "https:") {
    return "Please use a valid HTTPS URL.";
  }

  const host = targetUrl.hostname.toLowerCase();
  const path = `${targetUrl.pathname}${targetUrl.search}`;
  const isInstagramPage = host.includes("instagram.com") && !VIDEO_EXTENSION_PATTERN.test(path) && !IMAGE_EXTENSION_PATTERN.test(path);
  const isTikTokPage = host.includes("tiktok.com") && !VIDEO_EXTENSION_PATTERN.test(path) && !IMAGE_EXTENSION_PATTERN.test(path);

  if (isInstagramPage || isTikTokPage) {
    return "Only direct public media file URLs are supported for now. Instagram and TikTok page links require a dedicated integration.";
  }

  return null;
}

function inferResourceType(inputUrl: string) {
  if (VIDEO_EXTENSION_PATTERN.test(inputUrl)) {
    return "video";
  }

  if (IMAGE_EXTENSION_PATTERN.test(inputUrl)) {
    return "image";
  }

  return "auto";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await requireShopDev();
    const formData = await request.formData();
    const inputUrl = formData.get("url");

    if (!inputUrl || typeof inputUrl !== "string") {
      return Response.json({ error: "The URL is required." }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(inputUrl);
    } catch {
      return Response.json({ error: "Please enter a valid URL." }, { status: 400 });
    }

    const validationError = getDirectUrlValidationError(parsedUrl);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    const result = await cloudinary.uploader.upload(parsedUrl.toString(), {
      folder: "shopify-videos",
      resource_type: inferResourceType(parsedUrl.toString()),
    });

    const video = await prisma.video.create({
      data: buildMediaRecordData(shop.id, result),
    });

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
    console.error("[api.videos.import] import failed", error);
    return Response.json(
      { error: "Could not import the URL. Make sure the link points directly to a public media file." },
      { status: 500 }
    );
  }
};
