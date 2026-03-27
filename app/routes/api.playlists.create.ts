import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

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
    const { shop } = await requireShopDev();
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

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO playlist_meta (playlistId, description, productTags, updatedAt)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(playlistId)
      DO UPDATE SET
        description = excluded.description,
        productTags = excluded.productTags,
        updatedAt = CURRENT_TIMESTAMP
      `,
      playlist.id,
      description || null,
      JSON.stringify(tags)
    );

    return Response.json({ success: true, playlistId: playlist.id });
  } catch (error) {
    console.error("[api.playlists.create] failed", error);
    return Response.json({ error: "Failed to create playlist" }, { status: 500 });
  }
};
