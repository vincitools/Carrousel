import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireShop } from "../utils/requireShop.server";

function buildListThumbnail(url?: string | null) {
  if (!url) return null;
  const withTransformation = url.includes("/video/upload/")
    ? url.replace("/video/upload/", "/video/upload/so_1/")
    : url.replace("/upload/", "/upload/so_1/");

  return withTransformation.replace(/\.(mp4|mov|webm|m4v|avi|mkv)(\?.*)?$/i, ".jpg$2");
}

function isVideoUrl(url?: string | null) {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?.*)?$/i.test(url);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);

  const videos = await prisma.video.findMany({
    where: {
      shopId: shop.id
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      _count: {
        select: {
          productTags: true,
        },
      },
    },
  });

  const media = videos.map((v) => {
    const inferredType = v.type === "VIDEO" || isVideoUrl(v.originalUrl) ? "VIDEO" : "IMAGE";

    return {
    id: v.id,
    type: inferredType,
    url: v.originalUrl,
    taggedProductsCount: v._count?.productTags || 0,
    thumbnail:
      v.thumbnailUrl || (inferredType === "VIDEO" ? buildListThumbnail(v.originalUrl) : v.originalUrl)
    };
  });

  return Response.json({ media });
};