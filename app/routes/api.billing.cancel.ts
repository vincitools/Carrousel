import type { ActionFunctionArgs } from "react-router";
import { cancelBillingSubscriptionForShop } from "../services/billing.server";
import { requireShop } from "../utils/requireShop.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await requireShop(request);

    if (!shop.shopDomain || !shop.accessToken || shop.accessToken === "dev-token") {
      return Response.json({ error: "Shop authentication is required." }, { status: 401 });
    }

    const result = await cancelBillingSubscriptionForShop(shop.id, shop.shopDomain, shop.accessToken);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("[api.billing.cancel] failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not cancel subscription." },
      { status: 500 },
    );
  }
};
