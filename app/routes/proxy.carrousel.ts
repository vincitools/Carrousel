import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type StorefrontItem = {
  id: string;
  title: string;
  type: "VIDEO" | "IMAGE";
  url: string | null;
  thumbnail: string | null;
  productIds: string[];
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
  const productId = (url.searchParams.get("productId") || "").trim();
  const limit = Math.max(1, Math.min(24, Number(url.searchParams.get("limit") || "12")));

  if (!shopDomain) {
    return jsonResponse({ items: [], error: "Missing shop domain." }, 400);
  }

  // If a live session is present, keep the shop record fresh.
  // If not (e.g. session storage was cleared), fall through using the shop
  // domain from the query param — the HMAC already proved legitimacy.
  if (proxyContext.session) {
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

  // Return playlist list for the design-mode picker
  if (mode === "list") {
    const playlists = await prisma.playlist.findMany({
      where: { shopId: shop.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return jsonResponse({ playlists });
  }

  let items: StorefrontItem[] = [];

  // Product-tagged source always takes priority
  if (source === "product" && productId) {
    items = await getProductTaggedVideos(shop.id, productId, limit);
  }

  // If a playlist name was provided, try it next (case-insensitive, regardless of source)
  if (items.length === 0 && playlistName) {
    items = await getNamedPlaylistVideos(shop.id, playlistName, limit);
  }

  // Last resort: alphabetically-first playlist
  if (items.length === 0) {
    items = await getDefaultPlaylistVideos(shop.id, limit);
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
  }

  return jsonResponse({
    items,
    source,
    playlist: playlistName || "Default",
    productId: productId || null,
  });
};