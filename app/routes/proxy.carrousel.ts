import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

type StorefrontItem = {
  id: string;
  title: string;
  type: "VIDEO" | "IMAGE";
  url: string | null;
  thumbnail: string | null;
  productIds: string[];
  linkedProduct?: {
    id: string;
    title: string;
    handle: string;
    image: string | null;
    price: string | null;
    compareAtPrice: string | null;
    description: string | null;
    url: string;
  } | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

function cleanPlaylistName(value: string | null) {
  return (value || "").trim();
}

function toProductGid(value: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("gid://shopify/Product/")) return trimmed;
  const numeric = trimmed.match(/(\d+)/)?.[1];
  return numeric ? `gid://shopify/Product/${numeric}` : trimmed;
}

function toProductNumericId(value: string) {
  const match = (value || "").trim().match(/(\d+)/);
  return match?.[1] || "";
}

const PRODUCT_PREVIEW_QUERY = `
  query ProductPreviews($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        description
        handle
        featuredImage {
          url
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        compareAtPriceRange {
          minVariantCompareAtPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

function mapProductPreviewNodes(nodes: any[]) {
  const byGid = new Map<string, StorefrontItem["linkedProduct"]>();

  for (const node of nodes) {
    if (!node?.id || !node?.handle) continue;
    const priceAmount = node?.priceRangeV2?.minVariantPrice?.amount || null;
    const priceCurrency = node?.priceRangeV2?.minVariantPrice?.currencyCode || null;
    const compareAmount = node?.compareAtPriceRange?.minVariantCompareAtPrice?.amount || null;
    const compareCurrency = node?.compareAtPriceRange?.minVariantCompareAtPrice?.currencyCode || null;

    byGid.set(node.id, {
      id: node.id,
      title: node.title || "Product",
      handle: node.handle,
      image: node?.featuredImage?.url || null,
      price: priceAmount && priceCurrency ? `${priceCurrency} ${priceAmount}` : null,
      compareAtPrice:
        compareAmount && compareCurrency ? `${compareCurrency} ${compareAmount}` : null,
      description: node?.description || null,
      url: `/products/${node.handle}`,
    });
  }

  return byGid;
}

async function fetchProductPreviewMap(
  shopDomain: string,
  accessToken: string,
  rawProductIds: string[],
) {
  const uniqueGids = Array.from(new Set(rawProductIds.map(toProductGid).filter(Boolean)));
  if (uniqueGids.length === 0) return new Map<string, StorefrontItem["linkedProduct"]>();

  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: PRODUCT_PREVIEW_QUERY, variables: { ids: uniqueGids } }),
    },
  );

  const payload = (await response.json()) as any;
  const nodes = Array.isArray(payload?.data?.nodes) ? payload.data.nodes : [];
  return mapProductPreviewNodes(nodes);
}

async function fetchProductPreviewMapViaSessionAdmin(
  shopDomain: string,
  rawProductIds: string[],
) {
  const uniqueGids = Array.from(new Set(rawProductIds.map(toProductGid).filter(Boolean)));
  if (uniqueGids.length === 0) return new Map<string, StorefrontItem["linkedProduct"]>();

  const { admin } = await unauthenticated.admin(shopDomain);
  const response = await admin.graphql(PRODUCT_PREVIEW_QUERY, {
    variables: { ids: uniqueGids },
  });
  const payload: any = await response.json();
  const nodes = Array.isArray(payload?.data?.nodes) ? payload.data.nodes : [];
  return mapProductPreviewNodes(nodes);
}

async function fetchProductPreviewMapViaRest(
  shopDomain: string,
  accessToken: string,
  rawProductIds: string[],
) {
  const numericIds = Array.from(
    new Set(rawProductIds.map(toProductNumericId).filter(Boolean)),
  );
  const byGid = new Map<string, StorefrontItem["linkedProduct"]>();
  if (numericIds.length === 0) return byGid;

  const results = await Promise.allSettled(
    numericIds.map(async (id) => {
      const response = await fetch(
        `https://${shopDomain}/admin/api/2025-07/products/${id}.json`,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
        },
      );

      if (!response.ok) return null;
      const payload: any = await response.json();
      const product = payload?.product;
      if (!product?.id || !product?.handle) return null;

      const firstVariant = Array.isArray(product.variants) ? product.variants[0] : null;
      const price = firstVariant?.price ? String(firstVariant.price) : null;
      const compareAtPrice = firstVariant?.compare_at_price
        ? String(firstVariant.compare_at_price)
        : null;

      return {
        gid: `gid://shopify/Product/${product.id}`,
        linkedProduct: {
          id: `gid://shopify/Product/${product.id}`,
          title: product.title || "Product",
          handle: product.handle,
          image: product?.image?.src || null,
          price,
          compareAtPrice,
          description: product?.body_html
            ? String(product.body_html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
            : null,
          url: `/products/${product.handle}`,
        } as NonNullable<StorefrontItem["linkedProduct"]>,
      };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.gid && result.value?.linkedProduct) {
      byGid.set(result.value.gid, result.value.linkedProduct);
    }
  }

  return byGid;
}

function mapVideoItem(video: {
  id: string;
  title: string | null;
  type: "VIDEO" | "IMAGE";
  originalUrl: string | null;
  thumbnailUrl: string | null;
}): StorefrontItem {
  return {
    id: video.id,
    title: video.title || "Untitled media",
    type: video.type,
    url: video.originalUrl,
    thumbnail: video.thumbnailUrl || video.originalUrl,
    productIds: [],
  };
}

async function getDefaultPlaylistVideos(shopId: string, limit: number) {
  const playlist = await prisma.playlist.findFirst({
    where: { shopId },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
    include: {
      videos: {
        orderBy: { position: "asc" },
        take: limit,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              type: true,
              originalUrl: true,
              thumbnailUrl: true,
            },
          },
        },
      },
    },
  });

  return playlist?.videos.map((entry) => mapVideoItem(entry.video)) || [];
}

async function getNamedPlaylistVideos(shopId: string, playlistName: string, limit: number) {
  // Case-insensitive match — SQLite doesn't support Prisma's mode:'insensitive'
  const candidates = await prisma.playlist.findMany({
    where: { shopId },
    select: { id: true, name: true },
  });
  const match = candidates.find(
    (p) => p.name.trim().toLowerCase() === playlistName.trim().toLowerCase(),
  );
  if (!match) return [];

  const playlist = await prisma.playlist.findUnique({
    where: { id: match.id },
    include: {
      videos: {
        orderBy: { position: "asc" },
        take: limit,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              type: true,
              originalUrl: true,
              thumbnailUrl: true,
            },
          },
        },
      },
    },
  });

  return playlist?.videos.map((entry) => mapVideoItem(entry.video)) || [];
}

async function getPlaylistVideosById(shopId: string, playlistId: string, limit: number) {
  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, shopId },
    include: {
      videos: {
        orderBy: { position: "asc" },
        take: limit,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              type: true,
              originalUrl: true,
              thumbnailUrl: true,
            },
          },
        },
      },
    },
  });

  return playlist?.videos.map((entry) => mapVideoItem(entry.video)) || [];
}

async function getProductTaggedVideos(shopId: string, productId: string, limit: number) {
  const tagged = await prisma.videoProductTag.findMany({
    where: { shopifyProductId: productId, video: { shopId } },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      video: {
        select: {
          id: true,
          title: true,
          type: true,
          originalUrl: true,
          thumbnailUrl: true,
        },
      },
    },
  });

  return tagged.map((entry) => mapVideoItem(entry.video));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Validates HMAC — throws 400 if the request is not from Shopify's app proxy.
  const proxyContext = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  // After HMAC validation the `shop` query param is trustworthy.
  const shopDomain = (
    proxyContext.session?.shop || url.searchParams.get("shop") || ""
  ).trim().toLowerCase();
  const mode = (url.searchParams.get("mode") || "carousel").trim().toLowerCase();
  const source = (url.searchParams.get("source") || "default").trim().toLowerCase();
  const playlistName = cleanPlaylistName(url.searchParams.get("playlist"));
  const playlistHandle = cleanPlaylistName(url.searchParams.get("playlistHandle"));
  const productId = (url.searchParams.get("productId") || "").trim();
  const limit = Math.max(1, Math.min(24, Number(url.searchParams.get("limit") || "12")));

  if (!shopDomain) {
    return jsonResponse({ items: [], error: "Missing shop domain." }, 400);
  }

  // If a live session is present, keep the shop record fresh.
  // If not (e.g. session storage was cleared), fall through using the shop
  // domain from the query param — the HMAC already proved legitimacy.
  if (proxyContext.session?.accessToken) {
    await prisma.shop.upsert({
      where: { shopDomain },
      update: {
        accessToken: proxyContext.session.accessToken,
        uninstalledAt: null,
      },
      create: {
        shopDomain,
        accessToken: proxyContext.session.accessToken,
      },
    });
  }

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  // If the Shop row was lost (e.g. DB reset), rebuild it from the offline
  // Shopify session so proxy requests keep working in production/theme editor.
  if (!shop) {
    const offlineSession = await prisma.session.findFirst({
      where: {
        shop: shopDomain,
        isOnline: false,
      },
      select: {
        accessToken: true,
      },
    });

    if (offlineSession?.accessToken) {
      const rebuiltShop = await prisma.shop.upsert({
        where: { shopDomain },
        update: {
          accessToken: offlineSession.accessToken,
          uninstalledAt: null,
        },
        create: {
          shopDomain,
          accessToken: offlineSession.accessToken,
          uninstalledAt: null,
        },
        select: { id: true },
      });

      shop = rebuiltShop;
    }
  }

  // If domain-based resolution failed but a playlist name was requested,
  // resolve shop by unique playlist match across active shops.
  if (!shop && playlistName) {
    const allPlaylists = await prisma.playlist.findMany({
      select: {
        shopId: true,
        name: true,
        shop: {
          select: {
            uninstalledAt: true,
          },
        },
      },
    });
    const normalizedTarget = playlistName.trim().toLowerCase();
    const matchingShopIds = Array.from(
      new Set(
        allPlaylists
          .filter(
            (p) =>
              !p.shop.uninstalledAt &&
              p.name.trim().toLowerCase() === normalizedTarget,
          )
          .map((p) => p.shopId),
      ),
    );
    if (matchingShopIds.length === 1) {
      shop = { id: matchingShopIds[0] };
    }
  }

  // Dev-only fallback: if DB was reset and session storage is out of sync,
  // use the newest active shop so Theme Editor preview does not hard-fail.
  if (!shop && process.env.NODE_ENV !== "production") {
    shop = await prisma.shop.findFirst({
      where: { uninstalledAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
  }

  // Production-safe fallback: if there is exactly one active installed shop,
  // use it when incoming proxy domain doesn't match the stored shop domain
  // (common during domain migrations/custom-domain changes).
  if (!shop && process.env.NODE_ENV === "production") {
    const activeShops = await prisma.shop.findMany({
      where: { uninstalledAt: null },
      select: { id: true },
      take: 2,
      orderBy: { updatedAt: "desc" },
    });
    if (activeShops.length === 1) {
      shop = { id: activeShops[0].id };
    }
  }

  if (!shop) {
    return jsonResponse(
      {
        items: [],
        error:
          "No playlist data was found for this store yet. Open the app in Shopify Admin to finish setup.",
      },
      404,
    );
  }

  const shopRecord = await prisma.shop.findUnique({
    where: { id: shop.id },
    select: { id: true, shopDomain: true, accessToken: true },
  });

  if (!shopRecord) {
    return jsonResponse(
      {
        items: [],
        error:
          "No playlist data was found for this store yet. Open the app in Shopify Admin to finish setup.",
      },
      404,
    );
  }

  // Return playlist list for the design-mode picker
  if (mode === "list") {
    const playlists = await prisma.playlist.findMany({
      where: { shopId: shopRecord.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return jsonResponse({ playlists });
  }

  let items: StorefrontItem[] = [];

  // Product-tagged source always takes priority
  if (source === "product" && productId) {
    items = await getProductTaggedVideos(shopRecord.id, productId, limit);
  }

  // If a playlist id (or legacy handle) was provided, try it next
  if (items.length === 0 && playlistHandle) {
    items = await getPlaylistVideosById(shopRecord.id, playlistHandle, limit);
  }

  // Legacy fallback by name
  if (items.length === 0 && playlistName) {
    items = await getNamedPlaylistVideos(shopRecord.id, playlistName, limit);
  }

  // "Specific playlist" without a match should stay empty (do not show the wrong playlist).
  if (source === "playlist" && items.length === 0) {
    return jsonResponse({
      items: [],
      source,
      playlist: playlistHandle || playlistName || null,
      productId: productId || null,
      error:
        playlistHandle || playlistName
          ? "No media in this playlist yet, or the playlist could not be found."
          : "Choose a playlist in the block settings (Media source: Specific playlist).",
    });
  }

  // Default / other sources: last resort is the first alphabetically named playlist
  if (items.length === 0) {
    items = await getDefaultPlaylistVideos(shopRecord.id, limit);
  }

  // Enrich items with their tagged product IDs (single batch query)
  if (items.length > 0) {
    const tagRecords = await prisma.videoProductTag.findMany({
      where: { videoId: { in: items.map((i) => i.id) } },
      select: { videoId: true, shopifyProductId: true },
    });
    const tagMap = new Map<string, string[]>();
    for (const tag of tagRecords) {
      if (!tagMap.has(tag.videoId)) tagMap.set(tag.videoId, []);
      tagMap.get(tag.videoId)!.push(tag.shopifyProductId);
    }
    items = items.map((item) => ({
      ...item,
      productIds: tagMap.get(item.id) || [],
    }));

    // Attach preview data for first linked product (used by storefront modal UI)
    const allProductIds = items.flatMap((item) => item.productIds || []);
    if (allProductIds.length > 0) {
      let productPreviewByGid = new Map<string, StorefrontItem["linkedProduct"]>();

      if (shopRecord.accessToken) {
        try {
          productPreviewByGid = await fetchProductPreviewMap(
            shopRecord.shopDomain,
            shopRecord.accessToken,
            allProductIds,
          );
        } catch (error) {
          console.warn("[proxy.carrousel] token preview lookup failed", error);
        }
      }

      // Fallback: use Shopify SDK session-backed admin client.
      if (productPreviewByGid.size === 0) {
        try {
          productPreviewByGid = await fetchProductPreviewMapViaSessionAdmin(
            shopRecord.shopDomain,
            allProductIds,
          );
        } catch (error) {
          console.warn("[proxy.carrousel] session admin preview lookup failed", error);
        }
      }

      // Last fallback: direct Admin REST by numeric product ID.
      const unresolvedBeforeRest = Array.from(
        new Set(allProductIds.map(toProductGid).filter(Boolean)),
      ).filter((gid) => !productPreviewByGid.has(gid));

      if (unresolvedBeforeRest.length > 0 && shopRecord.accessToken) {
        try {
          const restPreviewByGid = await fetchProductPreviewMapViaRest(
            shopRecord.shopDomain,
            shopRecord.accessToken,
            unresolvedBeforeRest,
          );
          for (const [gid, preview] of restPreviewByGid.entries()) {
            if (!productPreviewByGid.has(gid)) {
              productPreviewByGid.set(gid, preview);
            }
          }
        } catch (error) {
          console.warn("[proxy.carrousel] rest preview lookup failed", error);
        }
      }

      const unresolvedAfterAll = Array.from(
        new Set(allProductIds.map(toProductGid).filter(Boolean)),
      ).filter((gid) => !productPreviewByGid.has(gid));
      if (unresolvedAfterAll.length > 0) {
        console.warn("[proxy.carrousel] unresolved linked product ids", unresolvedAfterAll);
      }

      items = items.map((item) => {
        const firstId = (item.productIds || [])[0];
        const firstGid = firstId ? toProductGid(firstId) : "";
        return {
          ...item,
          linkedProduct: firstGid ? productPreviewByGid.get(firstGid) || null : null,
        };
      });
    }
  }

  return jsonResponse({
    items,
    source,
    playlist: playlistHandle || playlistName || "Default",
    productId: productId || null,
  });
};