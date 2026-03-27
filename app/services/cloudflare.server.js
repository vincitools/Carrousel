function getCloudflareHeaders() {
  return {
    Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function createStreamUploadUrl() {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`,
    {
      method: "POST",
      headers: getCloudflareHeaders(),
      body: JSON.stringify({
        maxDurationSeconds: 300,
        allowedOrigins: ["*"],
        requireSignedURLs: false,
      }),
    }
  );

  const data = await res.json();

  if (!data.success) {
    throw new Error("Cloudflare Stream upload URL creation failed");
  }

  return {
    uploadURL: data.result.uploadURL,
    streamId: data.result.uid,
  };
}

export async function getStreamStatus(streamId) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${streamId}`,
    {
      method: "GET",
      headers: getCloudflareHeaders(),
    }
  );

  const data = await res.json();

  if (!data.success || !data.result) {
    throw new Error("Cloudflare Stream status fetch failed");
  }

  const readyToStream = Boolean(data.result.readyToStream);
  if (readyToStream) {
    return "ready";
  }

  return "processing";
}
