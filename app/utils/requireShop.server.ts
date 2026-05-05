import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { requireShopDev } from "./requireShopDev.server";

export async function requireShop(request: Request) {
  try {
    const { session, admin } = await authenticate.admin(request);
    if (!session.accessToken) {
      throw new Error("Missing access token on authenticated admin session.");
    }

    const shop = await prisma.shop.upsert({
      where: { shopDomain: session.shop },
      update: {
        accessToken: session.accessToken,
        uninstalledAt: null,
      },
      create: {
        shopDomain: session.shop,
        accessToken: session.accessToken,
      },
    });

    return { session, shop, admin };
  } catch (error) {
    // Fallback strategy for internal embedded navigations where session headers
    // may be missing on child routes (e.g., /app/library document requests).
    const requestUrl = new URL(request.url);
    const shopFromQuery = (requestUrl.searchParams.get("shop") || "").trim();
    const shopFromHeader = (request.headers.get("x-shopify-shop-domain") || "").trim();

    let shopFromReferer = "";
    try {
      const referer = request.headers.get("referer") || "";
      shopFromReferer = referer
        ? (new URL(referer).searchParams.get("shop") || "").trim()
        : "";
    } catch {
      shopFromReferer = "";
    }

    const candidateShop = shopFromQuery || shopFromHeader || shopFromReferer;

    if (candidateShop && candidateShop !== "dev-shop.myshopify.com") {
      const shopRow = await prisma.shop.findFirst({
        where: { shopDomain: candidateShop, uninstalledAt: null },
      });
      if (shopRow) {
        return { session: { shop: shopRow.shopDomain }, shop: shopRow, admin: null };
      }

      const offlineSession = await prisma.session.findFirst({
        where: {
          shop: candidateShop,
          isOnline: false,
          accessToken: { not: "" },
        },
        select: { shop: true, accessToken: true },
      });

      if (offlineSession?.shop && offlineSession.accessToken) {
        const rebuiltShop = await prisma.shop.upsert({
          where: { shopDomain: offlineSession.shop },
          update: {
            accessToken: offlineSession.accessToken,
            uninstalledAt: null,
          },
          create: {
            shopDomain: offlineSession.shop,
            accessToken: offlineSession.accessToken,
            uninstalledAt: null,
          },
        });

        return { session: { shop: rebuiltShop.shopDomain }, shop: rebuiltShop, admin: null };
      }
    }

    // Production-safe final fallback: if there is exactly one active shop, use it.
    if (process.env.NODE_ENV === "production") {
      const activeShops = await prisma.shop.findMany({
        where: { uninstalledAt: null },
        orderBy: { updatedAt: "desc" },
        take: 2,
      });

      if (activeShops.length === 1) {
        return {
          session: { shop: activeShops[0].shopDomain },
          shop: activeShops[0],
          admin: null,
        };
      }

      // Preserve real Shopify auth redirects if we cannot safely recover context.
      if (error instanceof Response && error.status >= 300 && error.status < 400) {
        throw error;
      }

      throw error;
    }

    console.warn("[requireShop] authenticate.admin failed, using dev fallback", error);
    return requireShopDev();
  }
}
