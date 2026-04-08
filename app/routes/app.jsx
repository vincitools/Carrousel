import { Outlet, useLoaderData, useRouteError, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const requestShop = requestUrl.searchParams.get("shop") || "";

  let refererShop = "";
  try {
    const referer = request.headers.get("referer") || "";
    refererShop = referer ? new URL(referer).searchParams.get("shop") || "" : "";
  } catch {
    refererShop = "";
  }

  const shop = requestShop || refererShop;

  try {
    await authenticate.admin(request);
  } catch (error) {
    // If Shopify redirects to /auth/login without shop param, preserve shop
    // from URL/referer so embedded auth can complete reliably.
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      const location = error.headers.get("Location") || "";
      if (location.startsWith("/auth/login")) {
        try {
          const loginUrl = new URL(location, requestUrl.origin);
          if (shop) {
            loginUrl.searchParams.set("shop", shop);
          }
          if (!loginUrl.searchParams.get("shop")) {
            console.error("[app.loader] Missing shop for auth login redirect", {
              requestUrl: requestUrl.toString(),
              referer: request.headers.get("referer") || "",
            });
          }
          throw redirect(loginUrl.pathname + loginUrl.search);
        } catch (redirectError) {
          console.error("[app.loader] Failed building auth redirect URL", redirectError);
          throw error;
        }
      }
    }

    throw error;
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || process.env.API_KEY || "" };
};

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
