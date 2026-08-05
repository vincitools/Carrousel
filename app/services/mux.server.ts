import Mux from "@mux/mux-node";

let muxClient: Mux | null = null;

export function getMuxConfigIssue() {
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    return "Mux env vars missing (MUX_TOKEN_ID / MUX_TOKEN_SECRET)";
  }
  return null;
}

export function getMuxClient() {
  const issue = getMuxConfigIssue();
  if (issue) throw new Error(issue);

  if (!muxClient) {
    muxClient = new Mux({
      tokenId: process.env.MUX_TOKEN_ID!,
      tokenSecret: process.env.MUX_TOKEN_SECRET!,
      webhookSecret: process.env.MUX_WEBHOOK_SECRET || undefined,
    });
  }

  return muxClient;
}

export function buildMuxPlaybackUrl(playbackId: string) {
  // Progressive MP4 for native <video> tags (requires static_renditions on the asset)
  return `https://stream.mux.com/${playbackId}/highest.mp4`;
}

export function buildMuxThumbnailUrl(playbackId: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`;
}

export function buildMuxHlsUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

function resolveCorsOrigin() {
  // Shopify embedded admin can load from the app host; "*" avoids CORS friction
  // while merchants use custom domains / Render / tunnels.
  return "*";
}

const PUBLIC_PLAYBACK = {
  playback_policies: ["public"] as ("public")[],
  video_quality: "basic" as const,
  static_renditions: [{ resolution: "highest" as const }],
};

/**
 * Create a Mux Direct Upload URL. Client PUTs the file to upload.url.
 * passthrough should be our Video.id so webhooks can find the row.
 */
export async function createMuxDirectUpload(passthrough: string) {
  const mux = getMuxClient();
  const upload = await mux.video.uploads.create({
    cors_origin: resolveCorsOrigin(),
    new_asset_settings: {
      ...PUBLIC_PLAYBACK,
      passthrough,
    },
  });

  return {
    uploadId: upload.id,
    uploadURL: upload.url,
  };
}

/** Create a Mux asset from a remote media URL (imports). */
export async function createMuxAssetFromUrl(mediaUrl: string, passthrough: string) {
  const mux = getMuxClient();
  const asset = await mux.video.assets.create({
    inputs: [{ url: mediaUrl }],
    ...PUBLIC_PLAYBACK,
    passthrough,
  });

  return asset;
}

export async function getMuxAsset(assetId: string) {
  const mux = getMuxClient();
  return mux.video.assets.retrieve(assetId);
}

export async function getMuxUpload(uploadId: string) {
  const mux = getMuxClient();
  return mux.video.uploads.retrieve(uploadId);
}

export async function deleteMuxAsset(assetId: string) {
  const mux = getMuxClient();
  try {
    await mux.video.assets.delete(assetId);
  } catch (error) {
    console.warn("[mux] failed to delete asset", assetId, error);
  }
}

export function unwrapMuxWebhook(rawBody: string, headers: Headers) {
  const mux = getMuxClient();
  return mux.webhooks.unwrap(rawBody, headers);
}

export function extractPlaybackId(asset: { playback_ids?: Array<{ id: string; policy?: string }> | null }) {
  const playbackIds = asset.playback_ids || [];
  const publicPlayback = playbackIds.find((p) => p.policy === "public") || playbackIds[0];
  return publicPlayback?.id || null;
}

export function resolveMediaPlaybackUrl(video: {
  muxPlaybackId?: string | null;
  originalUrl?: string | null;
}) {
  if (video.muxPlaybackId) return buildMuxPlaybackUrl(video.muxPlaybackId);
  return video.originalUrl || null;
}

export function resolveMediaThumbnailUrl(video: {
  muxPlaybackId?: string | null;
  thumbnailUrl?: string | null;
  originalUrl?: string | null;
}) {
  if (video.thumbnailUrl) return video.thumbnailUrl;
  if (video.muxPlaybackId) return buildMuxThumbnailUrl(video.muxPlaybackId);
  return video.originalUrl || null;
}
