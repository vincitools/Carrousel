import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

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

export const loader = async ({ request }) => {

  const { shop } = await requireShopDev();

  const videos = await prisma.video.findMany({
    where: {
      shopId: shop.id
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const media = videos.map((v) => {
    const inferredType = v.type === "VIDEO" || isVideoUrl(v.originalUrl) ? "VIDEO" : "IMAGE";

    return {
    id: v.id,
    type: inferredType,
    url: v.originalUrl,
    thumbnail:
      v.thumbnailUrl || (inferredType === "VIDEO" ? buildListThumbnail(v.originalUrl) : v.originalUrl)
    };
  });

  return Response.json({ media });
};