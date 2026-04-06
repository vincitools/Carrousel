import type { LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { requireShop } from "../utils/requireShop.server";

const GQL_QUERY = `
  query SearchProducts($query: String!) {
    products(first: 25, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          status
          handle
          featuredImage { url }
        }
      }
    }
  }
`;

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
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const shopParam = (url.searchParams.get("shop") || "").trim();

  const variables = { query: query ? `${query} status:ACTIVE` : "status:ACTIVE" };

  // 1) Best path: use the Shopify SDK's unauthenticated.admin() which reads the
  //    stored offline session directly from DB. shopParam comes from the page
  //    loader which ran in a fully-authenticated server context.
  if (shopParam && shopParam !== "dev-shop.myshopify.com") {
    try {
      const { admin } = await unauthenticated.admin(shopParam);
      const response = await admin.graphql(GQL_QUERY, { variables });
      const payload: any = await response.json();
      const edges = payload?.data?.products?.edges || [];
      return Response.json({ products: normalizeProducts(edges.map((e: any) => e.node)) });
    } catch (err) {
      console.warn("[api.products.search] unauthenticated.admin failed for", shopParam, err);
    }
  }

  // 2) Fallback: try authenticate.admin() using the Bearer token from the embedded app.
  try {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(GQL_QUERY, { variables });
    const payload: any = await response.json();
    const edges = payload?.data?.products?.edges || [];
    return Response.json({ products: normalizeProducts(edges.map((e: any) => e.node)) });
  } catch (err) {
    console.warn("[api.products.search] authenticate.admin failed", err);
  }

  // 3) Last resort: use requireShop (which itself has dev fallback built in).
  try {
    const { admin, shop } = await requireShop(request);
    if (admin) {
      const response = await admin.graphql(GQL_QUERY, { variables });
      const payload: any = await response.json();
      const edges = payload?.data?.products?.edges || [];
      return Response.json({ products: normalizeProducts(edges.map((e: any) => e.node)) });
    }
    // requireShop returned a dev/offline shop with no admin client.
    const shopDomain = shop?.shopDomain;
    if (shopDomain && shopDomain !== "dev-shop.myshopify.com" && shop?.accessToken) {
      const resp = await fetch(`https://${shopDomain}/admin/api/2025-07/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": shop.accessToken },
        body: JSON.stringify({ query: GQL_QUERY, variables }),
      });
      const payload: any = await resp.json();
      if (resp.ok && !payload?.errors) {
        const edges = payload?.data?.products?.edges || [];
        return Response.json({ products: normalizeProducts(edges.map((e: any) => e.node)) });
      }
      const gqlErr = Array.isArray(payload?.errors)
        ? payload.errors.map((e: any) => e?.message).join(" | ")
        : `${resp.status} ${resp.statusText}`;
      return Response.json(
        { products: [], error: `Unable to load products: ${gqlErr}` },
        { status: 502 },
      );
    }
  } catch (err) {
    console.warn("[api.products.search] requireShop fallback failed", err);
  }

  return Response.json(
    {
      products: [],
      error: "Unable to load products: open the app in Shopify Admin to authenticate, then try again.",
    },
    { status: 401 },
  );
};
