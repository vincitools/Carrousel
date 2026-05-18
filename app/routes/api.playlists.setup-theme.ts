import type { ActionFunctionArgs } from "react-router";
import { setupThemePlaylistPickerForShop } from "../services/playlistMetaobjectSync.server";
import { PLAYLIST_THEME_METAOBJECT_TYPE } from "../constants/playlistMetaobject";
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

    const needsAppUpdate = result.needsAppUpdate && !result.definitionReady;

    return Response.json({
      success: result.definitionReady,
      definitionReady: result.definitionReady,
      needsAppUpdate,
      hasLegacyMerchantDefinition: result.hasLegacyMerchantDefinition,
      expectedType: PLAYLIST_THEME_METAOBJECT_TYPE,
      types: result.types,
      message: result.definitionReady
        ? "Theme Editor playlist picker is ready. Refresh the Theme Editor and select a playlist."
        : needsAppUpdate && result.hasLegacyMerchantDefinition
          ? "Your store has an older playlist setup. Deploy the latest app version, then ask the merchant to update Vinci Shoppable Videos in Shopify Admin → Apps."
          : needsAppUpdate
            ? "Playlist picker needs the latest app version. Run shopify app deploy, then have the merchant update the app in Shopify Admin → Apps and open Playlists once."
            : "Could not verify the playlist definition. Open the app in Admin and try again.",
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
