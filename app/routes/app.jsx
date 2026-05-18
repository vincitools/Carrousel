import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/polaris";
import prisma from "../db.server";
import { setupThemePlaylistPickerForShop } from "../services/playlistMetaobjectSync.server";
import { I18nProvider, useI18n } from "../utils/i18n";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);

    // Keep playlist metaobjects in sync so Theme Editor dropdown works
    // even before the merchant opens the Playlists page.
    try {
      await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        update: { accessToken: session.accessToken, uninstalledAt: null },
        create: { shopDomain: session.shop, accessToken: session.accessToken },
      });
      const shop = await prisma.shop.findUnique({
        where: { shopDomain: session.shop },
        select: { id: true },
      });
      if (shop?.id) {
        await setupThemePlaylistPickerForShop(shop.id, {
          accessToken: session.accessToken,
          shopDomain: session.shop,
        });
      }
    } catch (syncError) {
      console.warn("[app loader] playlist metaobject sync failed", syncError);
    }
  } catch (_) {
    // Layout can render regardless; child route loaders handle their own auth.
    // The apiKey is a public client ID, safe to return without strict auth.
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || process.env.API_KEY || "" };
};

export function shouldRevalidate() {
  // apiKey never changes at runtime; skip re-auth on every child-route navigation.
  return false;
}

export default function AppLayout() {
  const { apiKey } = useLoaderData();

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <I18nProvider>
        <AppShell />
      </I18nProvider>
    </ShopifyAppProvider>
  );
}

function AppShell() {
  const { t } = useI18n();
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        <a href="/app" rel="home">
          {t("Dashboard")}
        </a>
        <a href="/app/analytics">{t("Analytics")}</a>
        <a href="/app/library">{t("Media")}</a>
        <a href="/app/playlists">{t("Playlists")}</a>
        <a href="/app/settings">{t("Settings")}</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[app.jsx ErrorBoundary]", error);
  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
