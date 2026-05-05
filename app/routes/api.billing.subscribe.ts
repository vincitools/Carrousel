import type { ActionFunctionArgs } from "react-router";
import { createSubscriptionConfirmationUrl } from "../services/billing.server";
import { requireShop } from "../utils/requireShop.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await requireShop(request);
    const formData = await request.formData();
    const plan = String(formData.get("plan") || "").trim() as "premium_monthly" | "premium_yearly";

    if (plan !== "premium_monthly" && plan !== "premium_yearly") {
      return Response.json({ error: "Invalid plan selected." }, { status: 400 });
    }

    if (!shop.shopDomain || !shop.accessToken || shop.accessToken === "dev-token") {
      return Response.json({ error: "Shop authentication is required before subscribing." }, { status: 401 });
    }

    const confirmationUrl = await createSubscriptionConfirmationUrl({
      shopDomain: shop.shopDomain,
      accessToken: shop.accessToken,
      planKey: plan,
    });

    return Response.json({ success: true, confirmationUrl });
  } catch (error) {
    console.error("[api.billing.subscribe] failed", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not start billing checkout.",
      },
      { status: 500 },
    );
  }
};
