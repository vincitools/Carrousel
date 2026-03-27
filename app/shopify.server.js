import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const getFirstEnv = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

const resolveAppUrl = () => {
  const host = getFirstEnv("HOST", "RENDER_EXTERNAL_HOSTNAME");
  const configured = getFirstEnv("SHOPIFY_APP_URL", "APP_URL", "RENDER_EXTERNAL_URL");

  if (host) {
    return host.startsWith("http") ? host : `https://${host}`;
  }

  return configured || "";
};

const resolvedApiVersion =
  ApiVersion.July25 ||
  ApiVersion.April25 ||
  "2025-07";

const resolvedApiKey = getFirstEnv(
  "SHOPIFY_API_KEY",
  "API_KEY",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_API_CLIENT_ID",
);

const resolvedApiSecret = getFirstEnv(
  "SHOPIFY_API_SECRET",
  "API_SECRET_KEY",
  "SHOPIFY_API_SECRET_KEY",
  "SHOPIFY_CLIENT_SECRET",
);

if (!resolvedApiKey) {
  console.error(
    "[shopify] Missing API key env. Checked: SHOPIFY_API_KEY, API_KEY, SHOPIFY_CLIENT_ID, SHOPIFY_API_CLIENT_ID",
  );
}

const shopify = shopifyApp({
  apiKey: resolvedApiKey,
  apiSecretKey: resolvedApiSecret || "",
  apiVersion: resolvedApiVersion,
  scopes: getFirstEnv("SCOPES")?.split(","),
  appUrl: resolveAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = resolvedApiVersion;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
