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
  const playlist = await prisma.playlist.findFirst({
    where: { shopId, name: playlistName },
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

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

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

  let items: StorefrontItem[] = [];

  if (source === "product" && productId) {
    items = await getProductTaggedVideos(shop.id, productId, limit);
  }

  if (items.length === 0 && source === "playlist" && playlistName) {
    items = await getNamedPlaylistVideos(shop.id, playlistName, limit);
  }

  if (items.length === 0 && playlistName) {
    items = await getNamedPlaylistVideos(shop.id, playlistName, limit);
  }

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