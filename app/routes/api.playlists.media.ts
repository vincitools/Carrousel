import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

const MAX_ITEMS_PER_PLAYLIST = 10;

function getTitleFromUrl(url: string | null, fallbackId: string) {
  if (!url) return fallbackId;
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() || fallbackId;
    return decodeURIComponent(lastSegment).replace(/\.(mp4|mov|webm|m4v|avi|mkv|jpg|jpeg|png|gif|webp|avif)$/i, "");
  } catch {
    return fallbackId;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await requireShopDev();
    const url = new URL(request.url);
    const playlistId = String(url.searchParams.get("playlistId") || "").trim();

    if (!playlistId) {
      return Response.json({ error: "playlistId is required" }, { status: 400 });
    }

    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId, shopId: shop.id },
      include: {
        videos: {
          select: { videoId: true, position: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!playlist) {
      return Response.json({ error: "Playlist not found" }, { status: 404 });
    }

    const selectedVideoIds = new Set(playlist.videos.map((entry) => entry.videoId));

    const media = await prisma.video.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        thumbnailUrl: true,
        originalUrl: true,
      },
      take: 200,
    });

    return Response.json({
      playlist: {
        id: playlist.id,
        name: playlist.name,
      },
      maxItems: MAX_ITEMS_PER_PLAYLIST,
      media: media.map((item) => ({
        id: item.id,
        type: item.type,
        title: getTitleFromUrl(item.originalUrl || item.thumbnailUrl, item.id),
        thumbnail: item.thumbnailUrl || item.originalUrl,
        url: item.originalUrl,
        selected: selectedVideoIds.has(item.id),
      })),
    });
  } catch (error) {
    console.error("[api.playlists.media] loader failed", error);
    return Response.json({ error: "Failed to load playlist media" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await requireShopDev();
    const formData = await request.formData();

    const playlistId = String(formData.get("playlistId") || "").trim();
    const rawMediaIds = String(formData.get("mediaIds") || "[]");

    if (!playlistId) {
      return Response.json({ error: "playlistId is required" }, { status: 400 });
    }

    let mediaIds: string[] = [];
    try {
      const parsed = JSON.parse(rawMediaIds);
      mediaIds = Array.isArray(parsed)
        ? parsed.filter((id) => typeof id === "string" && id.trim().length > 0)
        : [];
    } catch {
      return Response.json({ error: "Invalid mediaIds payload" }, { status: 400 });
    }

    if (mediaIds.length > MAX_ITEMS_PER_PLAYLIST) {
      return Response.json({ error: `You can add up to ${MAX_ITEMS_PER_PLAYLIST} items per playlist.` }, { status: 400 });
    }

    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId, shopId: shop.id },
      select: { id: true, name: true },
    });

    if (!playlist) {
      return Response.json({ error: "Playlist not found" }, { status: 404 });
    }

    const ownedMedia = await prisma.video.findMany({
      where: {
        shopId: shop.id,
        id: { in: mediaIds },
      },
      select: { id: true },
    });

    if (ownedMedia.length !== mediaIds.length) {
      return Response.json({ error: "One or more media items are invalid." }, { status: 400 });
    }

    await prisma.playlistVideo.deleteMany({ where: { playlistId: playlist.id } });

    if (mediaIds.length > 0) {
      await prisma.playlistVideo.createMany({
        data: mediaIds.map((videoId, index) => ({
          playlistId: playlist.id,
          videoId,
          position: index,
        })),
      });
    }

    return Response.json({ success: true, itemCount: mediaIds.length });
  } catch (error) {
    console.error("[api.playlists.media] action failed", error);
    return Response.json({ error: "Failed to save playlist content" }, { status: 500 });
  }
};
