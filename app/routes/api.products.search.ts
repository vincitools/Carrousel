import type { LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { requireShop } from "../utils/requireShop.server";
import prisma from "../db.server";

const DEV_PLACEHOLDER = "dev-shop.myshopify.com";

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

async function tryDirectGraphQL(shopDomain: string, accessToken: string, variables: Record<string, unknown>) {
  const response = await fetch(`https://${shopDomain}/admin/api/2025-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: GQL_QUERY, variables }),
  });

  const payload: any = await response.json();
  if (response.ok && !payload?.errors) {
    const edges = payload?.data?.products?.edges || [];
    return Response.json({ products: normalizeProducts(edges.map((e: any) => e.node)) });
  }

  const gqlErr = Array.isArray(payload?.errors)
    ? payload.errors.map((e: any) => e?.message).filter(Boolean).join(" | ")
    : `${response.status} ${response.statusText}`;
  throw new Error(gqlErr || "GraphQL request failed");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const shopParam = (url.searchParams.get("shop") || "").trim();

  const variables = { query: query ? `${query} status:ACTIVE` : "status:ACTIVE" };

  // 1) Best path: use the Shopify SDK's unauthenticated.admin() which reads the
  //    stored offline session directly from DB. shopParam comes from the page
  //    loader which ran in a fully-authenticated server context.
  if (shopParam && shopParam !== DEV_PLACEHOLDER) {
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
    if (shopDomain && shopDomain !== DEV_PLACEHOLDER && shop?.accessToken) {
      return await tryDirectGraphQL(shopDomain, shop.accessToken, variables);
    }
  } catch (err) {
    console.warn("[api.products.search] requireShop fallback failed", err);
  }

  // 4) DB fallback: try explicit token candidates from Shop and Session tables.
  try {
    const candidates: Array<{ shopDomain: string; accessToken: string; source: string }> = [];

    if (shopParam && shopParam !== DEV_PLACEHOLDER) {
      const specificShop = await prisma.shop.findFirst({
        where: {
          shopDomain: shopParam,
          uninstalledAt: null,
          NOT: { accessToken: "dev-token" },
        },
        select: { shopDomain: true, accessToken: true },
      });
      if (specificShop?.accessToken) {
        candidates.push({
          shopDomain: specificShop.shopDomain,
          accessToken: specificShop.accessToken,
          source: "shop-table-targeted",
        });
      }

      const specificSession = await prisma.session.findFirst({
        where: { shop: shopParam, isOnline: false, accessToken: { not: "" } },
        select: { shop: true, accessToken: true },
      });
      if (specificSession?.accessToken) {
        candidates.push({
          shopDomain: specificSession.shop,
          accessToken: specificSession.accessToken,
          source: "session-table-targeted",
        });
      }
    }

    const shopRows = await prisma.shop.findMany({
      where: {
        uninstalledAt: null,
        shopDomain: { not: DEV_PLACEHOLDER },
        NOT: { accessToken: "dev-token" },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { shopDomain: true, accessToken: true },
    });

    for (const row of shopRows) {
      if (row.shopDomain && row.accessToken) {
        candidates.push({ shopDomain: row.shopDomain, accessToken: row.accessToken, source: "shop-table" });
      }
    }

    const sessionRows = await prisma.session.findMany({
      where: {
        shop: { not: DEV_PLACEHOLDER },
        accessToken: { not: "" },
      },
      orderBy: [{ isOnline: "asc" }, { expires: "desc" }],
      take: 10,
      select: { shop: true, accessToken: true },
    });

    for (const row of sessionRows) {
      if (row.shop && row.accessToken) {
        candidates.push({ shopDomain: row.shop, accessToken: row.accessToken, source: "session-table" });
      }
    }

    const deduped = Array.from(
      new Map(candidates.map((c) => [`${c.shopDomain}::${c.accessToken}`, c])).values(),
    );

    let lastError = "";
    for (const candidate of deduped) {
      try {
        return await tryDirectGraphQL(candidate.shopDomain, candidate.accessToken, variables);
      } catch (err: any) {
        lastError = `${candidate.source}: ${err?.message || "unknown error"}`;
      }
    }

    if (lastError) {
      return Response.json(
        { products: [], error: `Unable to load products: ${lastError}` },
        { status: 502 },
      );
    }
  } catch (err) {
    console.warn("[api.products.search] DB token fallback failed", err);
  }

  // 5) Development fallback: return mock products if this is a dev shop
  if (shopParam === DEV_PLACEHOLDER && process.env.NODE_ENV !== "production") {
    console.log("[api.products.search] Returning mock products for dev shop");
    const mockQuery = (query || "").toLowerCase();
    const mockProducts = [
      {
        id: "mock://shopify/Product/1",
        title: "Premium Wireless Headphones",
        status: "ACTIVE",
        handle: "wireless-headphones",
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop",
      },
      {
        id: "mock://shopify/Product/2",
        title: "Vintage Camera Collection",
        status: "ACTIVE",
        handle: "vintage-camera",
        image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500&h=500&fit=crop",
      },
      {
        id: "mock://shopify/Product/3",
        title: "Smartwatch Pro Max",
        status: "ACTIVE",
        handle: "smartwatch-pro",
        image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop",
      },
      {
        id: "mock://shopify/Product/4",
        title: "Designer Sunglasses",
        status: "ACTIVE",
        handle: "designer-sunglasses",
        image: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500&h=500&fit=crop",
      },
      {
        id: "mock://shopify/Product/5",
        title: "Premium Coffee Maker",
        status: "ACTIVE",
        handle: "coffee-maker",
        image: "https://images.unsplash.com/photo-1517668808822-9ebb02ae2a0e?w=500&h=500&fit=crop",
      },
    ];

    // Filter by search query if provided
    const filtered = mockQuery
      ? mockProducts.filter(
          (p) =>
            p.title.toLowerCase().includes(mockQuery) ||
            p.handle.toLowerCase().includes(mockQuery),
        )
      : mockProducts;

    return Response.json({ products: filtered });
  }

  return Response.json(
    {
      products: [],
      error: "Unable to load products: open the app in Shopify Admin to authenticate, then try again.",
    },
    { status: 401 },
  );
};
