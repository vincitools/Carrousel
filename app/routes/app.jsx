import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const skipAdminAuth = process.env.SKIP_ADMIN_AUTH === "true";

  if (!skipAdminAuth) {
    await authenticate.admin(request);
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || process.env.API_KEY || "" };
};

export default function AppLayout() {
  const { apiKey } = useLoaderData();
  const location = useLocation();
  const search = location.search || "";

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <AppProvider i18n={{}}>
        <NavMenu>
          <a href={`/app${search}`} rel="home">
            Dashboard
          </a>
          <a href={`/app/library${search}`}>Media</a>
          <a href={`/app/playlists${search}`}>Playlists</a>
          <a href={`/app/widgets${search}`}>Widgets</a>
          <a href={`/app/settings${search}`}>Settings</a>
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
