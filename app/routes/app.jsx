import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/polaris";
import prisma from "../db.server";
import { syncPlaylistMetaobjectsForShop } from "../services/playlistMetaobjectSync.server";

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
        await syncPlaylistMetaobjectsForShop(shop.id, {
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
      <AppProvider i18n={{}}>
        <NavMenu>
          <a href="/app" rel="home">
            Dashboard
          </a>
          <a href="/app/analytics">Analytics</a>
          <a href="/app/library">Media</a>
          <a href="/app/playlists">Playlists</a>
          <a href="/app/settings">Settings</a>
        </NavMenu>
        <Outlet />
      </AppProvider>
    </ShopifyAppProvider>
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
