import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  const shopDomain = payload?.shop_domain ? String(payload.shop_domain) : shop;

  console.log(`[webhooks.shop.redact] Received ${topic} for ${shopDomain}`);

  const shopRow = await db.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shopRow?.id) {
    return new Response();
  }

  await db.$transaction(async (tx) => {
    await tx.videoInteractionEvent.deleteMany({ where: { shopId: shopRow.id } });
    await tx.videoAnalytics.deleteMany({ where: { video: { shopId: shopRow.id } } });
    await tx.videoProductTag.deleteMany({ where: { video: { shopId: shopRow.id } } });
    await tx.videoAsset.deleteMany({ where: { video: { shopId: shopRow.id } } });
    await tx.playlistVideo.deleteMany({ where: { playlist: { shopId: shopRow.id } } });
    await tx.playlist.deleteMany({ where: { shopId: shopRow.id } });
    await tx.video.deleteMany({ where: { shopId: shopRow.id } });
    await tx.themeSettings.deleteMany({ where: { shopId: shopRow.id } });
    await tx.billingSubscription.deleteMany({ where: { shopId: shopRow.id } });
    await tx.usageMetrics.deleteMany({ where: { shopId: shopRow.id } });
    await tx.session.deleteMany({ where: { shop: shopDomain } });
    await tx.shop.delete({ where: { id: shopRow.id } });
  });

  return new Response();
};
