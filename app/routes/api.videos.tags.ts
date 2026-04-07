import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireShop } from "../utils/requireShop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await requireShop(request);
    const url = new URL(request.url);
    const videoId = (url.searchParams.get("videoId") || "").trim();

    if (!videoId) {
      return Response.json({ error: "videoId is required" }, { status: 400 });
    }

    const video = await prisma.video.findFirst({
      where: {
        id: videoId,
        shopId: shop.id,
      },
      select: { id: true },
    });

    if (!video) {
      return Response.json({ error: "Media item not found" }, { status: 404 });
    }

    const tags = await prisma.videoProductTag.findMany({
      where: { videoId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        shopifyProductId: true,
      },
    });

    return Response.json({
      tags,
      productIds: tags.map((tag) => tag.shopifyProductId),
    });
  } catch (error) {
    console.error("[api.videos.tags] loader failed", error);
    return Response.json({ error: "Failed to load tags" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await requireShop(request);
    const formData = await request.formData();

    const videoId = String(formData.get("videoId") || "").trim();
    const rawProductIds = String(formData.get("productIds") || "[]");

    if (!videoId) {
      return Response.json({ error: "videoId is required" }, { status: 400 });
    }

    let productIds: string[] = [];
    try {
      const parsed = JSON.parse(rawProductIds);
      productIds = Array.isArray(parsed)
        ? parsed.filter((id) => typeof id === "string" && id.trim().length > 0)
        : [];
    } catch {
      return Response.json({ error: "Invalid productIds payload" }, { status: 400 });
    }

    if (productIds.some((id) => id.startsWith("mock://"))) {
      return Response.json(
        {
          error:
            "Mock products cannot be linked in production. Open the app in Shopify Admin and tag using real store products.",
        },
        { status: 400 },
      );
    }

    const video = await prisma.video.findFirst({
      where: {
        id: videoId,
        shopId: shop.id,
      },
      select: { id: true },
    });

    if (!video) {
      return Response.json({ error: "Media item not found" }, { status: 404 });
    }

    await prisma.videoProductTag.deleteMany({ where: { videoId } });

    if (productIds.length > 0) {
      await prisma.videoProductTag.createMany({
        data: productIds.map((shopifyProductId) => ({
          videoId,
          shopifyProductId,
        })),
      });
    }

    return Response.json({ success: true, productIds });
  } catch (error) {
    console.error("[api.videos.tags] action failed", error);
    return Response.json({ error: "Failed to save tags" }, { status: 500 });
  }
};
