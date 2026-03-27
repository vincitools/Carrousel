export const loader = async () => {
  const host = process.env.HOST;
  const configured = process.env.SHOPIFY_APP_URL;
  const origin = host
    ? host.startsWith("http")
      ? host
      : `https://${host}`
    : configured || "unknown";

  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    origin,
  });
};
