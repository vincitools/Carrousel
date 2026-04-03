import type { LoaderFunctionArgs } from "react-router";
import { requireShop } from "../utils/requireShop.server";
import prisma from "../db.server";

function normalizeProducts(raw: any[]) {
  return raw.map((node) => ({
    id: node.id,
    title: node.title,
    status: node.status,
    handle: node.handle,
    image: node.featuredImage?.url || null,
  }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim();

    const { session, shop, admin } = await requireShop(request);
    let shopDomain = shop?.shopDomain || session?.shop || "";

    if (!shopDomain) {
      return Response.json(
        {
          products: [],
          error: "No connected Shopify store found. Open the app once in Shopify Admin to sync the store session.",
        },
        { status: 401 },
      );
    }

    const gqlQuery = `
      query SearchProducts($query: String!) {
        products(first: 25, query: $query, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              status
              handle
              featuredImage {
                url
              }
            }
          }
        }
      }
    `;

    const variables = {
      query: query ? `${query} status:ACTIVE` : "status:ACTIVE",
    };

    let response: Response;
    let payload: any;

    if (admin) {
      response = await admin.graphql(gqlQuery, { variables });
      payload = await response.json();
    } else {
      const DEV_PLACEHOLDER = "dev-shop.myshopify.com";
      let tokenShop =
        shop && shop.shopDomain !== DEV_PLACEHOLDER && shop.accessToken !== "dev-token"
          ? shop
          : null;

      if (!tokenShop) {
        tokenShop = await prisma.shop.findFirst({
          where: {
            uninstalledAt: null,
            shopDomain: { not: DEV_PLACEHOLDER },
            NOT: { accessToken: "dev-token" },
          },
          orderBy: { updatedAt: "desc" },
        });
      }

      if (!tokenShop?.shopDomain || !tokenShop.accessToken) {
        return Response.json(
          {
            products: [],
            error:
              "Unable to load products: no real Shopify store token found. Open the app in Shopify Admin to authenticate.",
          },
          { status: 401 },
        );
      }

      shopDomain = tokenShop.shopDomain;
      response = await fetch(`https://${shopDomain}/admin/api/2025-07/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenShop.accessToken,
        },
        body: JSON.stringify({ query: gqlQuery, variables }),
      });
      payload = await response.json();
    }

    if (!response.ok || payload?.errors) {
      console.error("[api.products.search] graphql error", payload?.errors || payload);
      const graphqlMessage = Array.isArray(payload?.errors)
        ? payload.errors.map((entry: any) => entry?.message).filter(Boolean).join(" | ")
        : null;

      const httpMessage = !response.ok ? `${response.status} ${response.statusText}` : "GraphQL errors";

      return Response.json(
        {
          products: [],
          error: graphqlMessage
            ? `Shopify GraphQL request failed while loading products: ${graphqlMessage}`
            : response.status === 401
              ? "Shopify GraphQL request failed while loading products (401 Unauthorized). Reopen the app in Shopify Admin to refresh the session token."
              : `Shopify GraphQL request failed while loading products (${httpMessage}).`,
        },
        { status: 502 },
      );
    }

    const edges = payload?.data?.products?.edges || [];
    const products = normalizeProducts(edges.map((edge: any) => edge.node));

    return Response.json({ products });
  } catch (error: any) {
    console.error("[api.products.search] failed", error);

    const details =
      typeof error?.message === "string" && error.message.trim().length > 0
        ? ` ${error.message}`
        : "";

    return Response.json(
      { products: [], error: `Unexpected error while loading products.${details}` },
      { status: 500 },
    );
  }
};
