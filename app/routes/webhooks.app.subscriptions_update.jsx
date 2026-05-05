import db from "../db.server";
import { authenticate } from "../shopify.server";
import { syncBillingSubscriptionForShop } from "../services/billing.server";

export const action = async ({ request }) => {
  const { session, topic, shop } = await authenticate.webhook(request);
  console.log(`[webhooks.app.subscriptions_update] Received ${topic} for ${shop}`);

  if (!session?.accessToken) {
    return new Response();
  }

  const shopRow = await db.shop.findUnique({
    where: { shopDomain: shop },
    select: { id: true },
  });
  if (!shopRow?.id) {
    return new Response();
  }

  try {
    await syncBillingSubscriptionForShop(shopRow.id, shop, session.accessToken);
  } catch (error) {
    console.warn("[webhooks.app.subscriptions_update] billing sync failed", error);
  }

  return new Response();
};
