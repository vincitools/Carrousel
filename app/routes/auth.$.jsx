import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncPlaylistMetaobjectsForShop } from "../services/playlistMetaobjectSync.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { shop, accessToken } = session;

  const row = await prisma.shop.upsert({
    where: { shopDomain: shop },
    update: {
      accessToken,
      uninstalledAt: null,
    },
    create: {
      shopDomain: shop,
      accessToken,
    },
    select: { id: true },
  });

  // Sync $app:vinci_playlist metaobject entries as soon as OAuth finishes
  // (definition is installed from shopify.app.toml on deploy).
  // so the theme editor metaobject picker works even before /app is opened.
  try {
    if (row?.id) {
      await syncPlaylistMetaobjectsForShop(row.id, {
        accessToken: session.accessToken,
        shopDomain: session.shop,
      });
    }
  } catch (e) {
    console.warn("[auth] playlist metaobject sync failed", e);
  }

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
