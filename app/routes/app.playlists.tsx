import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { Banner, BlockStack, Button, Card, Modal, Page } from "@shopify/polaris";
import { getEmbeddedHeaders } from "../utils/embedded-auth.client";
import { authenticate } from "../shopify.server";
import { requireShopDev } from "../utils/requireShopDev.server";

type TemplateName = "product" | "index" | "collection";

function containsCarrouselBlock(content: string | undefined) {
  if (!content) return false;
  return content.includes("/blocks/carrousel-block/") || content.includes("carrousel-block");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let hasWidgetInstalled = false;

  try {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(`
      query PlaylistThemeCheck {
        themes(first: 20) {
          nodes {
            id
            role
          }
        }
      }
    `);

    const payload = (await response.json()) as {
      data?: { themes?: { nodes?: Array<{ id: string; role: string }> } };
    };
    const mainTheme = payload?.data?.themes?.nodes?.find((theme) => theme.role === "MAIN");

    if (mainTheme) {
      const filesResponse = await admin.graphql(
        `
          query ThemeFiles($id: ID!, $filenames: [String!]) {
            theme(id: $id) {
              files(first: 10, filenames: $filenames) {
                nodes {
                  filename
                  body {
                    ... on OnlineStoreThemeFileBodyText {
                      content
                    }
                  }
                }
              }
            }
          }
        `,
        {
          variables: {
            id: mainTheme.id,
            filenames: [
              "templates/product.json",
              "templates/index.json",
              "templates/collection.json",
            ] satisfies string[],
          },
        },
      );

      const filesPayload = (await filesResponse.json()) as {
        data?: {
          theme?: {
            files?: {
              nodes?: Array<{ filename: string; body?: { content?: string } | null }>;
            };
          };
        };
      };

      const templates: TemplateName[] = ["product", "index", "collection"];
      hasWidgetInstalled = templates.some((template) => {
        const filename = `templates/${template}.json`;
        const match = filesPayload?.data?.theme?.files?.nodes?.find((node) => node.filename === filename);
        return containsCarrouselBlock(match?.body?.content);
      });
    }
  } catch (error) {
    console.warn("[playlists] failed to evaluate theme block installation", error);
    const { shop } = await requireShopDev();
    hasWidgetInstalled = !!(await Promise.resolve(shop?.id));
  }

  return { hasWidgetInstalled };
};

type XhrRequestParams = {
  url: string;
  method?: string;
  body?: XMLHttpRequestBodyInit | null;
  timeoutMs?: number;
};

type XhrResult = {
  ok: boolean;
  status: number;
  payload: any;
};

type RequestJsonWithFallbackParams = {
  label: string;
  urls: string[];
  method?: string;
  body?: XMLHttpRequestBodyInit | null;
  timeoutMs: number;
};

type PlaylistItem = {
  id: string;
  name: string;
  description: string;
  productTags: string[];
  itemCount: number;
  thumbnails: Array<{ id: string; thumbnail: string }>;
};

type PlaylistMediaItem = {
  id: string;
  title: string;
  type: "VIDEO" | "IMAGE";
  thumbnail: string | null;
  url: string | null;
  selected: boolean;
};

async function xhrRequest({ url, method = "GET", body = null, timeoutMs = 15000 }: XhrRequestParams) {
  const headers = await getEmbeddedHeaders();

  return new Promise<XhrResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeoutMs;

    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.onload = () => {
      let payload = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }

      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        payload,
      });
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error(`Timeout after ${timeoutMs}ms`));
    xhr.onabort = () => reject(new Error("Request aborted"));

    xhr.send(body ?? null);
  });
}

async function requestJsonWithFallback({
  label,
  urls,
  method = "GET",
  body,
  timeoutMs,
}: RequestJsonWithFallbackParams) {
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const result = await xhrRequest({ url, method, body, timeoutMs });
      if (!result.ok) {
        lastError = new Error(result.payload?.error || `${label} failed (${result.status})`);
        continue;
      }
      return { payload: result.payload, status: result.status, url };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`${label} failed in all endpoints`);
}

export default function PlaylistsPage() {
  const { hasWidgetInstalled } = useLoaderData<typeof loader>();
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState<"details" | "media">("details");
  const [createdPlaylistId, setCreatedPlaylistId] = useState<string>("");
  const [createMediaItems, setCreateMediaItems] = useState<PlaylistMediaItem[]>([]);
  const [createSelectedMediaIds, setCreateSelectedMediaIds] = useState<string[]>([]);
  const [loadingCreateMedia, setLoadingCreateMedia] = useState(false);
  const [savingCreateContent, setSavingCreateContent] = useState(false);
  const [openAddContentModal, setOpenAddContentModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem | null>(null);
  const [playlistMedia, setPlaylistMedia] = useState<PlaylistMediaItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productTagInput, setProductTagInput] = useState("");

  const parsedTags = useMemo(
    () => productTagInput.split(",").map((tag) => tag.trim()).filter(Boolean),
    [productTagInput]
  );

  const loadPlaylists = async () => {
    setError("");
    try {
      const result = await xhrRequest({ url: "/api/playlists/list", method: "GET", timeoutMs: 15000 });
      if (!result.ok) {
        setError(result.payload?.error || "Failed to load playlists.");
        return;
      }

      const nextPlaylists = (result.payload?.playlists || []) as PlaylistItem[];
      setPlaylists(nextPlaylists);
      setExpandedIds((current) => {
        const allowed = new Set(nextPlaylists.map((playlist) => playlist.id));
        return current.filter((id) => allowed.has(id));
      });
    } catch (loadError) {
      console.error("[playlists] load failed", loadError);
      setError("Failed to load playlists.");
    }
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  const toggleExpanded = (playlistId: string) => {
    setExpandedIds((current) =>
      current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId]
    );
  };

  const closeCreateModal = () => {
    setOpenCreateModal(false);
    setCreateStep("details");
    setCreatedPlaylistId("");
    setCreateMediaItems([]);
    setCreateSelectedMediaIds([]);
  };

  const openCreate = () => {
    setOpenCreateModal(true);
    setCreateStep("details");
    setCreatedPlaylistId("");
    setCreateMediaItems([]);
    setCreateSelectedMediaIds([]);
    setError("");
    setName("");
    setDescription("");
    setProductTagInput("");
  };

  const createAndProceed = async () => {
    if (!name.trim() || creating) return;

    setCreating(true);
    setError("");
    try {
      const { payload } = await requestJsonWithFallback({
        label: "create playlist",
        urls: ["/api/playlists/create"],
        method: "POST",
        body: new URLSearchParams({
          name: name.trim(),
          description: description.trim(),
          productTags: parsedTags.join(","),
        }),
        timeoutMs: 15000,
      });

      if (!payload?.success) {
        setError(payload?.error || "Failed to create playlist.");
        return;
      }

      const newId = payload.playlistId as string;
      setCreatedPlaylistId(newId);
      setLoadingCreateMedia(true);
      setCreateStep("media");

      const result = await xhrRequest({
        url: `/api/playlists/media?playlistId=${encodeURIComponent(newId)}`,
        method: "GET",
        timeoutMs: 15000,
      });
      setCreateMediaItems(result.ok ? ((result.payload?.media || []) as PlaylistMediaItem[]) : []);
    } catch (createError) {
      console.error("[playlists] create failed", createError);
      setError("Failed to create playlist.");
    } finally {
      setCreating(false);
      setLoadingCreateMedia(false);
    }
  };

  const toggleCreateMediaSelection = (mediaId: string) => {
    setCreateSelectedMediaIds((current) => {
      if (current.includes(mediaId)) return current.filter((id) => id !== mediaId);
      if (current.length >= 10) return current;
      return [...current, mediaId];
    });
  };

  const saveCreateMedia = async () => {
    if (!createdPlaylistId || savingCreateContent) return;
    setSavingCreateContent(true);
    setError("");
    try {
      const { payload } = await requestJsonWithFallback({
        label: "save create media",
        urls: ["/api/playlists/media"],
        method: "POST",
        body: new URLSearchParams({
          playlistId: createdPlaylistId,
          mediaIds: JSON.stringify(createSelectedMediaIds),
        }),
        timeoutMs: 15000,
      });

      if (!payload?.success) {
        setError(payload?.error || "Failed to save content.");
        return;
      }

      closeCreateModal();
      await loadPlaylists();
    } catch (saveError) {
      console.error("[playlists] save create media failed", saveError);
      setError("Failed to save content.");
    } finally {
      setSavingCreateContent(false);
    }
  };

  const deletePlaylist = async (playlistId: string) => {
    if (!playlistId || deletingId) return;

    setDeletingId(playlistId);
    setError("");
    try {
      const { payload } = await requestJsonWithFallback({
        label: "delete playlist",
        urls: ["/api/playlists/delete"],
        method: "POST",
        body: new URLSearchParams({ playlistId }),
        timeoutMs: 15000,
      });

      if (!payload?.success) {
        setError(payload?.error || "Failed to delete playlist.");
        return;
      }

      await loadPlaylists();
    } catch (deleteError) {
      console.error("[playlists] delete failed", deleteError);
      setError("Failed to delete playlist.");
    } finally {
      setDeletingId("");
    }
  };

  const openAddContent = async (playlist: PlaylistItem) => {
    setActivePlaylist(playlist);
    setOpenAddContentModal(true);
    setLoadingContent(true);
    setError("");

    try {
      const result = await xhrRequest({
        url: `/api/playlists/media?playlistId=${encodeURIComponent(playlist.id)}`,
        method: "GET",
        timeoutMs: 15000,
      });

      if (!result.ok) {
        setError(result.payload?.error || "Failed to load playlist content.");
        setPlaylistMedia([]);
        setSelectedMediaIds([]);
        return;
      }

      const media = (result.payload?.media || []) as PlaylistMediaItem[];
      setPlaylistMedia(media);
      setSelectedMediaIds(media.filter((item) => item.selected).map((item) => item.id));
    } catch (openError) {
      console.error("[playlists] load add-content modal failed", openError);
      setError("Failed to load playlist content.");
      setPlaylistMedia([]);
      setSelectedMediaIds([]);
    } finally {
      setLoadingContent(false);
    }
  };

  const closeAddContentModal = () => {
    setOpenAddContentModal(false);
    setActivePlaylist(null);
    setPlaylistMedia([]);
    setSelectedMediaIds([]);
  };

  const toggleMediaSelection = (mediaId: string) => {
    setSelectedMediaIds((current) => {
      if (current.includes(mediaId)) {
        return current.filter((id) => id !== mediaId);
      }

      if (current.length >= 10) {
        return current;
      }

      return [...current, mediaId];
    });
  };

  const savePlaylistContent = async () => {
    if (!activePlaylist || savingContent) return;

    setSavingContent(true);
    setError("");

    try {
      const { payload } = await requestJsonWithFallback({
        label: "save playlist content",
        urls: ["/api/playlists/media"],
        method: "POST",
        body: new URLSearchParams({
          playlistId: activePlaylist.id,
          mediaIds: JSON.stringify(selectedMediaIds),
        }),
        timeoutMs: 15000,
      });

      if (!payload?.success) {
        setError(payload?.error || "Failed to save playlist content.");
        return;
      }

      closeAddContentModal();
      await loadPlaylists();
    } catch (saveError) {
      console.error("[playlists] save playlist content failed", saveError);
      setError("Failed to save playlist content.");
    } finally {
      setSavingContent(false);
    }
  };

  return (
    <Page title="Playlists" subtitle="Create, organize and publish media playlists." fullWidth>
      <BlockStack gap="400">
        <Card>
          <div style={{ margin: "0 auto", maxWidth: "980px", padding: "8px 12px 24px" }}>
            <div style={{ alignItems: "center", display: "flex", gap: "10px", paddingTop: "4px" }}>
            <ToolbarButton variant="secondary">How to Add in Theme Editor</ToolbarButton>
            <ToolbarButton variant="primary" onClick={openCreate}>+ Create Playlist</ToolbarButton>
          </div>


        {!hasWidgetInstalled && playlists.length > 0 ? (
          <div style={{ marginTop: "22px" }}>
            <Banner tone="warning" title="Your playlists are not visible on your store yet">
              <p style={{ margin: 0 }}>
                You&apos;ve created playlists, but you haven&apos;t added the app block in your Theme Editor yet.
              </p>
            </Banner>
          </div>
        ) : null}

            {error && (
              <div style={{ marginTop: "12px" }}>
                <Banner tone="critical">{error}</Banner>
              </div>
            )}

        <div style={{ background: "#fff", border: "1px solid #d9dce1", borderRadius: "14px", marginTop: "16px", overflow: "hidden" }}>
          <div style={{ color: "#6b7280", display: "grid", fontSize: "12px", fontWeight: 700, gridTemplateColumns: "1.4fr 1.2fr 1.2fr 120px", letterSpacing: "0.03em", padding: "14px 16px", textTransform: "uppercase" }}>
            <span>Name</span>
            <span>Conditional Tags</span>
            <span>Items</span>
            <span>Actions</span>
          </div>

          {playlists.map((playlist) => {
            const expanded = expandedIds.includes(playlist.id);
            const tagsLabel = playlist.productTags?.length ? playlist.productTags.join(", ") : "All pages";
            const isDefault = playlist.name.toLowerCase() === "default";

            return (
              <div key={playlist.id} style={{ borderTop: "1px solid #eef1f4" }}>
                <div style={{ alignItems: "center", display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1.2fr 120px", padding: "12px 16px" }}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(playlist.id)}
                    style={{ alignItems: "center", background: "transparent", border: "none", color: "#2563eb", cursor: "pointer", display: "inline-flex", fontSize: "17px", fontWeight: 700, gap: "8px", justifyContent: "flex-start", padding: 0 }}
                  >
                    <span style={{ color: "#1d4ed8", fontSize: "16px" }}>{expanded ? "⌃" : "⌄"}</span>
                    <span>{playlist.name}</span>
                  </button>

                  <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
                    <span style={{ color: "#6b7280", fontSize: "14px" }}>{tagsLabel}</span>
                    {!isDefault ? (
                      <Button variant="plain" onClick={openCreate}>
                        Edit Tags
                      </Button>
                    ) : null}
                  </div>

                  <Button
                    onClick={() => !isDefault && openAddContent(playlist)}
                    disabled={isDefault}
                    variant="primary"
                  >
                    Add Content
                  </Button>

                  <Button
                    onClick={() => deletePlaylist(playlist.id)}
                    disabled={isDefault || deletingId === playlist.id}
                    tone={isDefault ? undefined : "critical"}
                    variant="plain"
                  >
                    {isDefault ? "Info" : deletingId === playlist.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>

                {expanded && (
                  <div style={{ padding: "0 16px 16px 28px" }}>
                    {playlist.thumbnails?.length ? (
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {playlist.thumbnails.map((entry) => (
                          <div key={entry.id} style={{ borderRadius: "10px", border: "1px solid #e5e7eb", overflow: "hidden", width: "150px" }}>
                            <img src={entry.thumbnail} style={{ aspectRatio: "9 / 16", display: "block", objectFit: "cover", width: "100%" }} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: "#9ca3af", fontSize: "14px" }}>
                        No content items in this playlist yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
          </div>
        </Card>

      <OverlayModal
        open={openCreateModal}
        onClose={closeCreateModal}
        title={createStep === "details" ? "Create Playlist" : `Add Content to "${name}"`}
        primaryAction={
          createStep === "details"
            ? {
                content: creating ? "Creating..." : "Next: Add Content →",
                onAction: createAndProceed,
                disabled: !name.trim() || creating,
              }
            : {
                content: savingCreateContent
                  ? "Saving..."
                  : createSelectedMediaIds.length > 0
                  ? `Add ${createSelectedMediaIds.length} item${createSelectedMediaIds.length === 1 ? "" : "s"} to Playlist`
                  : "Finish without Content",
                onAction: createSelectedMediaIds.length > 0 ? saveCreateMedia : closeCreateModal,
                disabled: savingCreateContent,
              }
        }
        secondaryAction={
          createStep === "details"
            ? { content: "Cancel", onAction: closeCreateModal }
            : { content: "Skip", onAction: () => { closeCreateModal(); loadPlaylists(); } }
        }
      >
        {createStep === "details" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ color: "var(--p-color-text)", display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Vinci Shoppable Videos Playlist 4"
                style={{ border: "1px solid var(--p-color-border)", borderRadius: "8px", boxSizing: "border-box", fontSize: "14px", padding: "10px 12px", width: "100%" }}
              />
              <div style={{ color: "var(--p-color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>Required</div>
            </div>

            <div>
              <label style={{ color: "var(--p-color-text)", display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                style={{ border: "1px solid var(--p-color-border)", borderRadius: "8px", boxSizing: "border-box", fontSize: "14px", padding: "10px 12px", resize: "vertical", width: "100%" }}
              />
              <div style={{ color: "var(--p-color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>Optional</div>
            </div>

            <div style={{ background: "var(--p-color-bg-surface-info)", border: "1px solid var(--p-color-border-info)", borderRadius: "10px", padding: "14px" }}>
              <div style={{ alignItems: "center", display: "flex", gap: "8px", marginBottom: "8px" }}>
                <span style={{ alignItems: "center", background: "var(--p-color-bg-fill-info)", borderRadius: "50%", color: "#fff", display: "inline-flex", fontSize: "11px", fontWeight: 700, height: "18px", justifyContent: "center", width: "18px" }}>i</span>
                <span style={{ color: "var(--p-color-text)", fontSize: "14px", fontWeight: 700 }}>Show playlist only on specific product pages</span>
              </div>
              <p style={{ color: "var(--p-color-text-secondary)", fontSize: "13px", margin: "0 0 6px" }}>
                Tag this playlist with product tags from your store. It will only appear on product pages that have at least one matching tag. Leave empty to show on all pages.
              </p>
              <p style={{ color: "var(--p-color-text-secondary)", fontSize: "13px", margin: 0 }}>
                To add tags to products, go to Products in your Shopify admin and add tags in the Organization section.
              </p>
            </div>

            <div>
              <label style={{ color: "var(--p-color-text)", display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
                Product Tags
              </label>
              <input
                type="text"
                value={productTagInput}
                onChange={(event) => setProductTagInput(event.target.value)}
                placeholder="Search for product tags"
                style={{ border: "1px solid var(--p-color-border)", borderRadius: "8px", boxSizing: "border-box", fontSize: "14px", padding: "10px 12px", width: "100%" }}
              />
              <div style={{ color: "var(--p-color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Select tags to display this playlist only on products with these tags
              </div>
            </div>

            {error && <p style={{ color: "var(--p-color-text-critical)", margin: 0 }}>{error}</p>}
          </div>
        ) : (
          <div>
            <div style={{ background: "var(--p-color-bg-surface-info)", border: "1px solid var(--p-color-border-info)", borderRadius: "10px", color: "var(--p-color-text-secondary)", fontSize: "14px", marginBottom: "14px", padding: "12px 14px" }}>
              Playlist created! Now select up to 10 videos or images to add to it.
            </div>

            <div style={{ color: "var(--p-color-text-secondary)", fontSize: "14px", marginBottom: "10px" }}>
              {createSelectedMediaIds.length} selected &bull; {createMediaItems.length} available
            </div>

            <div style={{ maxHeight: "48vh", overflow: "auto" }}>
              {loadingCreateMedia ? (
                <div style={{ color: "var(--p-color-text-secondary)", padding: "30px 0", textAlign: "center" }}>Loading media...</div>
              ) : createMediaItems.length === 0 ? (
                <div style={{ color: "var(--p-color-text-secondary)", padding: "30px 0", textAlign: "center" }}>No media available yet.</div>
              ) : (
                <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 130px))" }}>
                  {createMediaItems.map((mediaItem) => {
                    const isSelected = createSelectedMediaIds.includes(mediaItem.id);
                    const blocked = !isSelected && createSelectedMediaIds.length >= 10;
                    return (
                      <button
                        key={mediaItem.id}
                        type="button"
                        onClick={() => !blocked && toggleCreateMediaSelection(mediaItem.id)}
                        style={{
                          background: isSelected ? "var(--p-color-bg-surface-selected)" : "var(--p-color-bg-surface)",
                          border: isSelected ? "2px solid var(--p-color-border-emphasis)" : "1px solid var(--p-color-border)",
                          borderRadius: "12px",
                          cursor: blocked ? "not-allowed" : "pointer",
                          opacity: blocked ? 0.5 : 1,
                          padding: "8px",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ color: "var(--p-color-text)", fontSize: "12px", fontWeight: 600, marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {mediaItem.title}
                        </div>
                        <div style={{ borderRadius: "8px", overflow: "hidden" }}>
                          {mediaItem.thumbnail ? (
                            <img src={mediaItem.thumbnail} alt={mediaItem.title} style={{ aspectRatio: "9 / 16", display: "block", objectFit: "cover", width: "100%" }} />
                          ) : (
                            <div style={{ alignItems: "center", aspectRatio: "9 / 16", background: "var(--p-color-bg-surface-secondary)", color: "var(--p-color-text-secondary)", display: "flex", fontSize: "12px", justifyContent: "center" }}>
                              No preview
                            </div>
                          )}
                        </div>
                        <div style={{ color: "var(--p-color-text-secondary)", fontSize: "11px", marginTop: "5px" }}>
                          {mediaItem.type === "VIDEO" ? "Video" : "Image"}{isSelected ? " • Selected" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && <p style={{ color: "var(--p-color-text-critical)", margin: "12px 0 0" }}>{error}</p>}
          </div>
        )}
      </OverlayModal>

      <OverlayModal
        open={openAddContentModal}
        onClose={closeAddContentModal}
        title={activePlaylist ? `Add Content to ${activePlaylist.name}` : "Add Content"}
        primaryAction={{
          content: savingContent
            ? "Saving..."
            : `Add ${selectedMediaIds.length} item${selectedMediaIds.length === 1 ? "" : "s"} to playlist`,
          onAction: savePlaylistContent,
          disabled: savingContent || !activePlaylist,
        }}
        secondaryAction={{ content: "Cancel", onAction: closeAddContentModal }}
      >
        <div>
          <div style={{ background: "#e9f2ff", borderRadius: "10px", color: "#0f172a", fontSize: "14px", marginBottom: "12px", padding: "12px 14px" }}>
            Info: Free plan can add up to 10 items per playlist.
          </div>

          <div style={{ color: "#6b7280", fontSize: "14px", marginBottom: "10px" }}>
            {selectedMediaIds.length} selected • {playlistMedia.length} available
          </div>

          <div style={{ maxHeight: "52vh", overflow: "auto" }}>
            {loadingContent ? (
              <div style={{ color: "#6b7280", padding: "30px 0", textAlign: "center" }}>Loading media...</div>
            ) : playlistMedia.length === 0 ? (
              <div style={{ color: "#6b7280", padding: "30px 0", textAlign: "center" }}>No media available yet.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 140px))", gap: "12px" }}>
                {playlistMedia.map((mediaItem) => {
                  const isSelected = selectedMediaIds.includes(mediaItem.id);
                  const blockedByLimit = !isSelected && selectedMediaIds.length >= 10;

                  return (
                    <button
                      key={mediaItem.id}
                      type="button"
                      onClick={() => !blockedByLimit && toggleMediaSelection(mediaItem.id)}
                      style={{
                        background: "#fff",
                        border: isSelected ? "2px solid #111827" : "1px solid #d1d5db",
                        borderRadius: "12px",
                        cursor: blockedByLimit ? "not-allowed" : "pointer",
                        opacity: blockedByLimit ? 0.55 : 1,
                        padding: "8px",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ color: "#111827", fontSize: "13px", fontWeight: 600, marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {mediaItem.title}
                      </div>

                      <div style={{ borderRadius: "8px", overflow: "hidden" }}>
                        {mediaItem.thumbnail ? (
                          <img src={mediaItem.thumbnail} alt={mediaItem.title} style={{ aspectRatio: "9 / 16", display: "block", objectFit: "cover", width: "100%" }} />
                        ) : (
                          <div style={{ alignItems: "center", aspectRatio: "9 / 16", background: "#f3f4f6", color: "#9ca3af", display: "flex", fontSize: "12px", justifyContent: "center" }}>
                            No preview
                          </div>
                        )}
                      </div>

                      <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "6px" }}>
                        {mediaItem.type === "VIDEO" ? "Video" : "Image"} {isSelected ? "• Selected" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </OverlayModal>
      </BlockStack>
    </Page>
  );
}

function OverlayModal({
  open,
  onClose,
  title,
  primaryAction,
  secondaryAction,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  primaryAction?: { content: string; onAction: () => void; disabled?: boolean };
  secondaryAction?: { content: string; onAction: () => void };
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={
        primaryAction
          ? {
              content: primaryAction.content,
              onAction: primaryAction.onAction,
              disabled: primaryAction.disabled,
            }
          : undefined
      }
      secondaryActions={
        secondaryAction
          ? [
              {
                content: secondaryAction.content,
                onAction: secondaryAction.onAction,
              },
            ]
          : []
      }
    >
      <Modal.Section>{children}</Modal.Section>
    </Modal>
  );
}

function ToolbarButton({
  children,
  onClick,
  variant = "secondary",
}: {
  children: string | string[];
  onClick?: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Button onClick={onClick} variant={variant === "primary" ? "primary" : "secondary"}>
      {children}
    </Button>
  );
}
