import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { resolveDisplayTitle } from "../services/media.server";
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
    const inferredType = v.type === "VIDEO" || isVideoUrl(v.originalUrl) || Boolean(v.muxPlaybackId)
      ? "VIDEO"
      : "IMAGE";

    const thumbnail =
      v.thumbnailUrl ||
      (v.muxPlaybackId
        ? `https://image.mux.com/${v.muxPlaybackId}/thumbnail.jpg?time=1`
        : inferredType === "VIDEO"
          ? buildListThumbnail(v.originalUrl)
          : v.originalUrl);

    return {
      id: v.id,
      type: inferredType,
      title: resolveDisplayTitle(v.title),
      url: v.originalUrl,
      status: v.status,
      taggedProductsCount: v._count?.productTags || 0,
      thumbnail,
    };
  });

  return Response.json({ media });
};