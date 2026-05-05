import db from "../db.server";
import { authenticate } from "../shopify.server";

function resolveComplianceKind(topic) {
  const upper = String(topic || "").toUpperCase().replace(/-/g, "_");
  const lower = String(topic || "").toLowerCase();
  if (upper.includes("DATA_REQUEST") || lower.includes("data_request")) return "data_request";
  if (upper.includes("CUSTOMERS_REDACT") || lower.includes("customers/redact")) return "customers_redact";
  if (upper.includes("SHOP_REDACT") || lower.includes("shop/redact")) return "shop_redact";
  return "";
}

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  const kind = resolveComplianceKind(topic);

  if (!kind) {
    console.warn("[webhooks.compliance] unknown topic", topic);
    return new Response(null, { status: 200 });
  }

  if (kind === "data_request") {
    const customerId = payload?.customer?.id ? String(payload.customer.id) : "unknown";
    console.log(`[webhooks.compliance] customers/data_request for ${shop} (customer ${customerId})`);
    return new Response();
  }

  if (kind === "customers_redact") {
    const customerId = payload?.customer?.id ? String(payload.customer.id) : "unknown";
    console.log(`[webhooks.compliance] customers/redact for ${shop} (customer ${customerId})`);
    return new Response();
  }

  const shopDomain = payload?.shop_domain ? String(payload.shop_domain) : shop;
  console.log(`[webhooks.compliance] shop/redact for ${shopDomain}`);

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
