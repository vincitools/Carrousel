import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncPlaylistMetaobjectsForShop } from "../services/playlistMetaobjectSync.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }

  try {
    const shopRow = await db.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true },
    });
    if (shopRow?.id && session?.accessToken) {
      await syncPlaylistMetaobjectsForShop(shopRow.id, {
        accessToken: session.accessToken,
        shopDomain: shop,
      });
    }
  } catch (error) {
    console.warn("[webhooks.app.scopes_update] playlist metaobject sync failed", error);
  }

  return new Response();
};
