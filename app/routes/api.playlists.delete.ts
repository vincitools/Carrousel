import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { syncPlaylistMetaobjectsForShop } from "../services/playlistMetaobjectSync.server";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    await prisma.shop.upsert({
      where: { shopDomain: session.shop },
      update: { accessToken: session.accessToken, uninstalledAt: null },
      create: { shopDomain: session.shop, accessToken: session.accessToken },
    });
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
      select: { id: true },
    });
    if (!shop?.id) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }
    const formData = await request.formData();
    const playlistId = String(formData.get("playlistId") || "").trim();

    if (!playlistId) {
      return Response.json({ error: "playlistId is required" }, { status: 400 });
    }

    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId, shopId: shop.id },
      select: { id: true, name: true },
    });

    if (!playlist) {
      return Response.json({ error: "Playlist not found" }, { status: 404 });
    }

    if (playlist.name.toLowerCase() === "default") {
      return Response.json({ error: "Default playlist cannot be deleted" }, { status: 400 });
    }

    await ensurePlaylistMetaTable();

    await prisma.playlistVideo.deleteMany({ where: { playlistId } });
    await prisma.playlist.delete({ where: { id: playlistId } });
    await prisma.$executeRaw`DELETE FROM playlist_meta WHERE playlistId = ${playlistId}`;
    await syncPlaylistMetaobjectsForShop(shop.id, {
      accessToken: session.accessToken,
      shopDomain: session.shop,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[api.playlists.delete] failed", error);
    return Response.json({ error: "Failed to delete playlist" }, { status: 500 });
  }
};
