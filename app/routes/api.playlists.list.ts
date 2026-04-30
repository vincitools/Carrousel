import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";
import { syncPlaylistMetaobjectsForShop } from "../services/playlistMetaobjectSync.server";

type PlaylistMetaRow = {
  playlistId: string;
  description: string | null;
  productTags: string | null;
};

async function ensurePlaylistMetaTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS playlist_meta (
      playlistId TEXT PRIMARY KEY,
      description TEXT,
      productTags TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function parseProductTags(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag) => typeof tag === "string" && tag.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function getThumbnail(video: { thumbnailUrl: string | null; originalUrl: string | null }) {
  return video.thumbnailUrl || video.originalUrl;
}

async function ensureDefaultPlaylistWithVideos(shopId: string) {
  let defaultPlaylist = await prisma.playlist.findFirst({
    where: { shopId, name: "Default" },
    select: { id: true },
  });

  if (!defaultPlaylist) {
    defaultPlaylist = await prisma.playlist.create({
      data: {
        shopId,
        name: "Default",
        isPublished: false,
      },
      select: { id: true },
    });
  }

  const latestVideos = await prisma.video.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true },
  });

  await prisma.playlistVideo.deleteMany({ where: { playlistId: defaultPlaylist.id } });

  if (latestVideos.length > 0) {
    await prisma.playlistVideo.createMany({
      data: latestVideos.map((video, index) => ({
        playlistId: defaultPlaylist.id,
        videoId: video.id,
        position: index,
      })),
    });
  }
}

export const loader = async (_args: LoaderFunctionArgs) => {
  try {
    const { shop } = await requireShopDev();
    await ensurePlaylistMetaTable();
    await ensureDefaultPlaylistWithVideos(shop.id);
    await syncPlaylistMetaobjectsForShop(shop.id);

    const playlists = await prisma.playlist.findMany({
      where: { shopId: shop.id },
      orderBy: [
        { name: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        videos: {
          orderBy: { position: "asc" },
          include: {
            video: {
              select: {
                id: true,
                thumbnailUrl: true,
                originalUrl: true,
              },
            },
          },
        },
      },
    });

    const rawMeta = (await prisma.$queryRawUnsafe(`
      SELECT playlistId, description, productTags
      FROM playlist_meta
    `)) as PlaylistMetaRow[];

    const metaByPlaylistId = new Map(rawMeta.map((row) => [row.playlistId, row]));

    const items = playlists.map((playlist) => {
      const meta = metaByPlaylistId.get(playlist.id);
      const productTags = parseProductTags(meta?.productTags || null);

      return {
        id: playlist.id,
        name: playlist.name,
        description: meta?.description || "",
        productTags,
        itemCount: playlist.videos.length,
        thumbnails: playlist.videos
          .map((entry) => ({
            id: entry.video.id,
            thumbnail: getThumbnail(entry.video),
          }))
          .filter((entry): entry is { id: string; thumbnail: string } => Boolean(entry.thumbnail)),
      };
    });

    return Response.json({ playlists: items });
  } catch (error) {
    console.error("[api.playlists.list] failed", error);
    return Response.json({ playlists: [], error: "Failed to load playlists" }, { status: 500 });
  }
};
