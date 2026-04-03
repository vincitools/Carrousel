import { v2 as cloudinary } from "cloudinary";
import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { buildMediaRecordData } from "../services/media.server";
import { requireShop } from "../utils/requireShop.server";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|webm|m4v|avi|mkv)(\?.*)?$/i;
const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i;

type ResolvedMedia = {
  mediaUrl: string;
  titleHint?: string;
};

function decodeEscapedUrl(value: string) {
  const unicodeDecoded = value.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  return unicodeDecoded
    .replace(/\\\//g, "/")
    .replace(/\\x26/g, "&");
}

function extractInstagramShortcode(parsedUrl: URL) {
  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i].toLowerCase();
    if (key === "reel" || key === "reels" || key === "p" || key === "tv") {
      return parts[i + 1];
    }
  }
  return "";
}

function normalizeTitleHint(value: string | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .replace(/^Watch\s+/i, "")
    .replace(/\s+on\s+(Instagram|TikTok).*$/i, "")
    .trim();
}

function extractMetaContent(html: string, propertyName: string) {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${propertyName}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  return html.match(regex)?.[1] || "";
}

function extractInstagramMediaUrl(html: string) {
  const ogVideo = extractMetaContent(html, "og:video:secure_url") || extractMetaContent(html, "og:video");
  if (ogVideo) return decodeEscapedUrl(ogVideo);

  const jsonVideoUrl = html.match(/"video_url"\s*:\s*"([^"]+)"/i)?.[1];
  if (jsonVideoUrl) return decodeEscapedUrl(jsonVideoUrl);

  const quotedVideoUrl = html.match(/"video_url":"([^"]+)"/i)?.[1];
  if (quotedVideoUrl) return decodeEscapedUrl(quotedVideoUrl);

  return "";
}

function extractTikTokMediaUrl(html: string) {
  const ogVideo = extractMetaContent(html, "og:video:secure_url") || extractMetaContent(html, "og:video");
  if (ogVideo) return decodeEscapedUrl(ogVideo);

  const playAddr = html.match(/"playAddr"\s*:\s*"([^"]+)"/i)?.[1];
  if (playAddr) return decodeEscapedUrl(playAddr);

  const downloadAddr = html.match(/"downloadAddr"\s*:\s*"([^"]+)"/i)?.[1];
  if (downloadAddr) return decodeEscapedUrl(downloadAddr);

  return "";
}

async function fetchPageHtml(targetUrl: string) {
  const response = await fetch(targetUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Could not fetch public page (${response.status}).`);
  }

  return response.text();
}

async function resolveSupportedMediaUrl(parsedUrl: URL): Promise<ResolvedMedia> {
  const path = `${parsedUrl.pathname}${parsedUrl.search}`;
  if (VIDEO_EXTENSION_PATTERN.test(path) || IMAGE_EXTENSION_PATTERN.test(path)) {
    return { mediaUrl: parsedUrl.toString() };
  }

  const host = parsedUrl.hostname.toLowerCase();
  const isInstagram = host.includes("instagram.com");
  const isTikTok = host.includes("tiktok.com") || host.includes("vm.tiktok.com");

  if (!isInstagram && !isTikTok) {
    throw new Error("Only Instagram, TikTok, or direct media URLs are supported.");
  }

  let html = await fetchPageHtml(parsedUrl.toString());
  let titleHint = normalizeTitleHint(
    extractMetaContent(html, "og:title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1],
  );

  let mediaUrl = isInstagram ? extractInstagramMediaUrl(html) : extractTikTokMediaUrl(html);

  // Instagram reels often hide direct URL on canonical page but expose it on embed endpoint.
  if (!mediaUrl && isInstagram) {
    const shortcode = extractInstagramShortcode(parsedUrl);
    if (shortcode) {
      const embedUrl = `https://www.instagram.com/reel/${shortcode}/embed/captioned/`;
      const embedHtml = await fetchPageHtml(embedUrl);
      mediaUrl = extractInstagramMediaUrl(embedHtml);
      if (!titleHint) {
        titleHint = normalizeTitleHint(
          extractMetaContent(embedHtml, "og:title") || embedHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1],
        );
      }
    }
  }

  if (!mediaUrl) {
    throw new Error(
      "Could not extract a public media file from this link. Private/restricted posts are not supported.",
    );
  }

  return { mediaUrl, titleHint };
}

function getDirectUrlValidationError(targetUrl: URL) {
  if (targetUrl.protocol !== "https:") {
    return "Please use a valid HTTPS URL.";
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
    const { shop } = await requireShop(request);
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

    const resolved = await resolveSupportedMediaUrl(parsedUrl);

    const result = await cloudinary.uploader.upload(resolved.mediaUrl, {
      folder: "shopify-videos",
      resource_type: inferResourceType(resolved.mediaUrl),
    });

    const video = await prisma.video.create({
      data: buildMediaRecordData(shop.id, result, resolved.titleHint || null),
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
      {
        error:
          error instanceof Error
            ? `Could not import the URL. ${error.message}`
            : "Could not import the URL. Make sure the post is public and the link is valid.",
      },
      { status: 500 }
    );
  }
};
