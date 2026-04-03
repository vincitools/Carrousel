import prisma from "../db.server";

export async function requireShopDev() {
  // Prefer a real installed shop first.
  const realShop = await prisma.shop.findFirst({
    where: {
      uninstalledAt: null,
      NOT: { accessToken: "dev-token" },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (realShop) {
    const matchingOfflineSession = await prisma.session.findFirst({
      where: {
        isOnline: false,
        shop: realShop.shopDomain,
      },
    });

    if (matchingOfflineSession?.accessToken) {
      const shop = await prisma.shop.update({
        where: { id: realShop.id },
        data: {
          accessToken: matchingOfflineSession.accessToken,
          uninstalledAt: null,
        },
      });
      return { shop, session: { shop: shop.shopDomain }, admin: null };
    }

    return { shop: realShop, session: { shop: realShop.shopDomain }, admin: null };
  }

  // If Shop table is empty/outdated but offline sessions still exist,
  // recover a real shop from session storage before using the fake dev shop.
  const offlineSession = await prisma.session.findFirst({
    where: {
      isOnline: false,
      shop: { not: "dev-shop.myshopify.com" },
      accessToken: { not: "" },
    },
  });

  if (offlineSession?.shop && offlineSession.accessToken) {
    const recoveredShop = await prisma.shop.upsert({
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

    return { shop: recoveredShop, session: { shop: recoveredShop.shopDomain }, admin: null };
  }

  // Fallback to fake dev shop (used when the app has never been authenticated).
  const shopDomain = "dev-shop.myshopify.com";
  let shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain, accessToken: "dev-token" },
    });
  }
  return { shop, session: { shop: shopDomain }, admin: null };
}