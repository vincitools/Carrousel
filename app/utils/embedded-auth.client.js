export async function getEmbeddedHeaders(initialHeaders = {}) {
  const headers = new Headers(initialHeaders);

  if (typeof window === "undefined") {
    return headers;
  }

  try {
    const shop = new URLSearchParams(window.location.search).get("shop");
    if (shop) {
      headers.set("x-shopify-shop-domain", shop);
    }
  } catch (error) {
    console.warn("[embedded-auth] failed to resolve shop domain", error);
  }

  try {
    const tokenPromise = window.shopify?.idToken?.();
    const token = await Promise.race([
      tokenPromise,
      new Promise((resolve) => {
        setTimeout(() => resolve(null), 1500);
      }),
    ]);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (error) {
    console.warn("[embedded-auth] failed to get session token", error);
  }

  return headers;
}