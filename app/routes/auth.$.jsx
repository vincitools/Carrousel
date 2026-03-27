import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { shop, accessToken } = session;

  await prisma.shop.upsert({
    where: { shopDomain: shop },
    update: {
      accessToken,
      uninstalledAt: null,
    },
    create: {
      shopDomain: shop,
      accessToken,
    },
  });

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
