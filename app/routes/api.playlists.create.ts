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

function parseProductTags(raw: string) {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    if (!session.accessToken) {
      return Response.json({ error: "Missing shop access token" }, { status: 401 });
    }
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

    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const rawProductTags = String(formData.get("productTags") || "").trim();

    if (!name) {
      return Response.json({ error: "Playlist name is required" }, { status: 400 });
    }

    const playlist = await prisma.playlist.create({
      data: {
        shopId: shop.id,
        name,
        isPublished: false,
      },
    });

    await ensurePlaylistMetaTable();
    const tags = parseProductTags(rawProductTags);

    await prisma.$executeRaw`
      INSERT INTO playlist_meta (playlistId, description, productTags, updatedAt)
      VALUES (${playlist.id}, ${description || null}, ${JSON.stringify(tags)}, CURRENT_TIMESTAMP)
      ON CONFLICT(playlistId)
      DO UPDATE SET
        description = excluded.description,
        productTags = excluded.productTags,
        updatedAt = CURRENT_TIMESTAMP
    `;

    await syncPlaylistMetaobjectsForShop(shop.id, {
      accessToken: session.accessToken,
      shopDomain: session.shop,
    });

    return Response.json({ success: true, playlistId: playlist.id });
  } catch (error) {
    console.error("[api.playlists.create] failed", error);
    return Response.json({ error: "Failed to create playlist" }, { status: 500 });
  }
};
