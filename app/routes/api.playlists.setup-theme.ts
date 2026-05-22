import type { ActionFunctionArgs } from "react-router";
import { setupThemePlaylistPickerForShop } from "../services/playlistMetaobjectSync.server";
import { requireShop } from "../utils/requireShop.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await requireShop(request);

    if (!shop.shopDomain || !shop.accessToken || shop.accessToken === "dev-token") {
      return Response.json(
        { error: "Open this app inside Shopify Admin to connect your store." },
        { status: 401 },
      );
    }

    const result = await setupThemePlaylistPickerForShop(shop.id, {
      shopDomain: shop.shopDomain,
      accessToken: shop.accessToken,
    });

    return Response.json({
      success: result.definitionReady,
      ...result,
    });
  } catch (error) {
    console.error("[api.playlists.setup-theme] failed", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Theme setup failed.",
      },
      { status: 500 },
    );
  }
};
