import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  const customerId = payload?.customer?.id ? String(payload.customer.id) : "unknown";

  console.log(`[webhooks.customers.redact] Received ${topic} for ${shop} (customer ${customerId})`);

  // This app does not store customer PII in its own database.
  // Webhook is acknowledged after HMAC verification.
  return new Response();
};
