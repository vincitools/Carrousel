import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  const customerId = payload?.customer?.id ? String(payload.customer.id) : "unknown";

  console.log(`[webhooks.customers.data_request] Received ${topic} for ${shop} (customer ${customerId})`);

  // This app does not store customer PII directly. Shopify may still send this webhook
  // as part of mandatory privacy compliance checks; acknowledge it after HMAC verification.
  return new Response();
};
