import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await requireShopDev();
    const formData = await request.formData();
    const rawIds = formData.get("ids");

    if (!rawIds || typeof rawIds !== "string") {
      return Response.json({ error: "No ids provided" }, { status: 400 });
    }

    const ids = JSON.parse(rawIds);
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: "No ids provided" }, { status: 400 });
    }

    const validIds = ids.filter((id) => typeof id === "string" && id.trim().length > 0);
    if (validIds.length === 0) {
      return Response.json({ error: "No valid ids provided" }, { status: 400 });
    }

    const result = await prisma.video.deleteMany({
      where: {
        shopId: shop.id,
        id: { in: validIds },
      },
    });

    return Response.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error("[api.videos.delete] delete failed", error);
    return Response.json({ error: "Failed to delete selected media" }, { status: 500 });
  }
};
