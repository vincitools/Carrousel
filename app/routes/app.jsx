import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/polaris";

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);
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
          <a href="/app/library">Media</a>
          <a href="/app/playlists">Playlists</a>
          <a href="/app/widgets">Widgets</a>
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
