import { useState, useEffect } from "react";

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function xhrRequest({ url, method = "GET", body, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeoutMs;

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
}) {
  let lastError = null;

  for (const url of urls) {
    try {
      console.log(`[library] ${label} trying`, url);
      const result = await xhrRequest({
        url,
        method,
        body,
        timeoutMs,
      });

      console.log(`[library] ${label} status`, result.status, "url=", url);
      if (!result.ok) {
        lastError = new Error(result.payload?.error || `${label} failed (${result.status})`);
        continue;
      }

      return { payload: result.payload, status: result.status, url };
    } catch (error) {
      console.error(`[library] ${label} error on`, url, error);
      lastError = error;
    }
  }

  console.error(`[library] ${label} failed in all endpoints`, urls, lastError);
  throw lastError || new Error(`${label} failed in all endpoints`);
}

export default function ContentLibrary() {
  const [openModal, setOpenModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadTab, setUploadTab] = useState("upload");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteConsent, setRemoteConsent] = useState(false);
  const [media, setMedia] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [taggingItem, setTaggingItem] = useState(null);
  const [products, setProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [tagError, setTagError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [viewMode, setViewMode] = useState("grid");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  
  // carregar biblioteca
  const loadMedia = async () => {
    const result = await xhrRequest({ url: "/api/videos/list", method: "GET", timeoutMs: 12000 });
    const data = result.payload;

    if (result.ok && data?.media) {
      setMedia(data.media);
      setSelectedIds((currentSelectedIds) => {
        const allowedIds = new Set(data.media.map((item) => item.id));
        return currentSelectedIds.filter((id) => allowedIds.has(id));
      });
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const resetUploadModal = () => {
    setOpenModal(false);
    setSelectedFile(null);
    setUploadTab("upload");
    setRemoteUrl("");
    setRemoteConsent(false);
    setUploadError("");
  };

  const switchUploadTab = (nextTab) => {
    setUploadTab(nextTab);
    setUploadError("");
  };

  const uploadFile = async () => {
    if (!selectedFile || uploading) return;
    setUploadError("");
    setUploading(true);

    const mediaType = selectedFile.type.startsWith("image/") ? "image" : "video";
    const signedUploadEndpoint = `/api/videos/upload?t=${Date.now()}&mediaType=${mediaType}`;
    const finalizeEndpoint = "/api/videos/finalize";
    const pingEndpoint = "/api/ping";
    
    console.log("[library] upload start", {
      signedUploadEndpoint,
      finalizeEndpoint,
      mediaType,
      origin: window.location.origin,
      search: window.location.search,
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
    });

    try {
      // Test connectivity first
      console.log("[library] testing ping endpoint", pingEndpoint);
      try {
        const pingRes = await xhrRequest({
          url: pingEndpoint,
          method: "GET",
          timeoutMs: 5000,
        });

        console.log("[library] ping status", pingRes.status, pingRes.payload);
        if (!pingRes.ok) {
          setUploadError("The server returned an error for the ping request.");
          return;
        }
      } catch (pingErr) {
        console.error("[library] ping failed:", pingErr);
        setUploadError("No server connectivity. Check your network or the app URL.");
        return;
      }

      console.log("[library] requesting signed upload params from", signedUploadEndpoint);
      const { payload: signPayload } = await requestJsonWithFallback({
        label: "signed params",
        urls: [signedUploadEndpoint],
        method: "GET",
        timeoutMs: 12000,
      });

      if (!signPayload?.uploadURL || !signPayload?.uploadParams) {
        console.error("[library] signed params error payload", signPayload);
        setUploadError(signPayload?.error || "Failed to get upload parameters.");
        return;
      }

      console.log("[library] uploading directly to Cloudinary");
      const cloudinaryFormData = new FormData();
      cloudinaryFormData.append("file", selectedFile);
      Object.entries(signPayload.uploadParams).forEach(([key, value]) => {
        cloudinaryFormData.append(key, String(value));
      });

      const cloudinaryController = new AbortController();
      const cloudinaryTimeout = setTimeout(() => cloudinaryController.abort(), 120000);
      const cloudinaryResponse = await fetch(signPayload.uploadURL, {
        method: "POST",
        body: cloudinaryFormData,
        signal: cloudinaryController.signal,
      });
      clearTimeout(cloudinaryTimeout);
      console.log("[library] cloudinary status", cloudinaryResponse.status);

      let cloudinaryPayload = null;
      try {
        cloudinaryPayload = await cloudinaryResponse.json();
      } catch {
        cloudinaryPayload = null;
      }

      if (!cloudinaryResponse.ok || !cloudinaryPayload?.secure_url) {
        console.error("[library] cloudinary error payload", cloudinaryPayload);
        setUploadError(
          cloudinaryPayload?.error?.message ||
            cloudinaryPayload?.message ||
            "Cloudinary upload failed."
        );
        return;
      }

      console.log("[library] finalizing media in backend");
      const { payload: finalizePayload } = await requestJsonWithFallback({
        label: "finalize",
        urls: [finalizeEndpoint],
        method: "POST",
        body: new URLSearchParams({ result: JSON.stringify(cloudinaryPayload) }),
        timeoutMs: 15000,
      });

      if (!finalizePayload?.success) {
        console.error("[library] finalize error payload", finalizePayload);
        setUploadError(finalizePayload?.error || "Failed to finalize the upload.");
        return;
      }

      await loadMedia();
      resetUploadModal();
    } catch (error) {
      console.error("[library] upload fetch error", error);
      if (error?.name === "AbortError") {
        setUploadError("Upload timeout: the server took longer than 90 seconds to respond.");
      } else {
        setUploadError("Network error while uploading.");
      }
    } finally {
      setUploading(false);
      console.log("[library] upload end");
    }
  };

  const importFromUrl = async () => {
    if (!remoteUrl.trim() || !remoteConsent || uploading) return;

    setUploadError("");
    setUploading(true);

    try {
      const { payload } = await requestJsonWithFallback({
        label: "import url",
        urls: ["/api/videos/import"],
        method: "POST",
        body: new URLSearchParams({
          url: remoteUrl.trim(),
          source: uploadTab,
        }),
        timeoutMs: 40000,
      });

      if (!payload?.success) {
        setUploadError(payload?.error || "Failed to import the URL.");
        return;
      }

      await loadMedia();
      resetUploadModal();
    } catch (error) {
      console.error("[library] import url error", error);
      setUploadError(error?.message || "Failed to import the URL.");
    } finally {
      setUploading(false);
    }
  };

  const toggleSelect = (mediaId) => {
    setSelectedIds((currentSelectedIds) => {
      if (currentSelectedIds.includes(mediaId)) {
        return currentSelectedIds.filter((id) => id !== mediaId);
      }
      return [...currentSelectedIds, mediaId];
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0 || deleting) return;

    setDeleteError("");
    setDeleting(true);

    try {
      const { payload } = await requestJsonWithFallback({
        label: "delete selected",
        urls: ["/api/videos/delete"],
        method: "POST",
        body: new URLSearchParams({ ids: JSON.stringify(selectedIds) }),
        timeoutMs: 15000,
      });

      if (!payload?.success) {
        setDeleteError(payload?.error || "Failed to delete the selected media.");
        return;
      }

      setSelectedIds([]);
      await loadMedia();
    } catch (error) {
      console.error("[library] delete selected error", error);
      setDeleteError("Failed to delete the selected media.");
    } finally {
      setDeleting(false);
    }
  };

  const loadProducts = async (query = "") => {
    setProductsLoading(true);
    setTagError("");
    try {
      const result = await xhrRequest({
        url: `/api/products/search?q=${encodeURIComponent(query)}`,
        method: "GET",
        timeoutMs: 15000,
      });

      if (!result.ok) {
        setTagError(result.payload?.error || "Failed to load products.");
        return;
      }

      setProducts(result.payload?.products || []);
    } catch (error) {
      console.error("[library] loadProducts failed", error);
      setTagError("Failed to load products.");
    } finally {
      setProductsLoading(false);
    }
  };

  const loadExistingTags = async (mediaId) => {
    try {
      const result = await xhrRequest({
        url: `/api/videos/tags?videoId=${encodeURIComponent(mediaId)}`,
        method: "GET",
        timeoutMs: 12000,
      });

      if (!result.ok) {
        setSelectedProductIds([]);
        return;
      }

      setSelectedProductIds(result.payload?.productIds || []);
    } catch (error) {
      console.error("[library] loadExistingTags failed", error);
      setSelectedProductIds([]);
    }
  };

  const openTagModal = async (item) => {
    setTaggingItem(item);
    setTagModalOpen(true);
    setTagError("");
    setProductQuery("");
    setProducts([]);
    setSelectedProductIds([]);

    await Promise.all([loadProducts(""), loadExistingTags(item.id)]);
  };

  const closeTagModal = () => {
    setTagModalOpen(false);
    setTaggingItem(null);
    setProducts([]);
    setSelectedProductIds([]);
    setProductQuery("");
    setTagError("");
  };

  const toggleProductSelection = (productId) => {
    setSelectedProductIds((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }

      return [...current, productId];
    });
  };

  const saveProductTags = async () => {
    if (!taggingItem || savingTags) return;

    setTagError("");
    setSavingTags(true);
    try {
      const { payload } = await requestJsonWithFallback({
        label: "save tags",
        urls: ["/api/videos/tags"],
        method: "POST",
        body: new URLSearchParams({
          videoId: taggingItem.id,
          productIds: JSON.stringify(selectedProductIds),
        }),
        timeoutMs: 15000,
      });

      if (!payload?.success) {
        setTagError(payload?.error || "Failed to save product tags.");
        return;
      }

      closeTagModal();
    } catch (error) {
      console.error("[library] saveProductTags failed", error);
      setTagError("Failed to save product tags.");
    } finally {
      setSavingTags(false);
    }
  };

  const allCount = media.length;
  const videoCount = media.filter((item) => item.type === "VIDEO").length;
  const imageCount = media.filter((item) => item.type === "IMAGE").length;
  const filteredMedia = media.filter((item) => {
    if (activeFilter === "videos") {
      return item.type === "VIDEO";
    }

    if (activeFilter === "images") {
      return item.type === "IMAGE";
    }

    return true;
  });

  return (
    <div>
      <div style={{ margin: "0 auto", maxWidth: "980px", padding: "8px 12px 32px" }}>
        <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: "39px", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0 }}>
              Content Library
            </h1>
            <p style={{ color: "#4b5563", fontSize: "15px", margin: "8px 0 0" }}>
              Manage your videos and images
            </p>
          </div>

          <div style={{ alignItems: "center", display: "flex", gap: "10px", paddingTop: "4px" }}>
            <ToolbarButton
              variant="secondary"
              onClick={deleteSelected}
              disabled={selectedIds.length === 0 || deleting}
            >
              {deleting ? "Deleting..." : selectedIds.length > 0 ? `Delete Items (${selectedIds.length})` : "Delete Items"}
            </ToolbarButton>
            <ToolbarButton variant="primary" onClick={() => setOpenModal(true)}>
              + Add New Content
            </ToolbarButton>
          </div>
        </div>

        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: "30px" }}>
          <p style={{ color: "#374151", fontSize: "15px", margin: 0 }}>
            Showing {filteredMedia.length} of {allCount} items
          </p>

          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        <div
          style={{
            alignItems: "center",
            background: "#ffffff",
            border: "1px solid #d9dce1",
            borderRadius: "16px",
            display: "flex",
            justifyContent: "space-between",
            gap: "14px",
            marginTop: "18px",
            padding: "6px 8px",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <FilterChip active={activeFilter === "all"} onClick={() => setActiveFilter("all")}>All ({allCount})</FilterChip>
            <FilterChip active={activeFilter === "videos"} onClick={() => setActiveFilter("videos")}>Videos ({videoCount})</FilterChip>
            <FilterChip active={activeFilter === "images"} onClick={() => setActiveFilter("images")}>Images ({imageCount})</FilterChip>
          </div>

          <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
            <IconButton label="Search and filter">⌕</IconButton>
            <IconButton label="Sort">⇅</IconButton>
          </div>
        </div>

        {deleteError && (
          <div style={{ marginTop: "12px" }}>
            <p style={{ color: "#b91c1c", fontSize: "14px", margin: 0 }}>{deleteError}</p>
          </div>
        )}

        <div style={{ marginTop: "22px" }}>
          {viewMode === "grid" ? (
            <MediaGrid media={filteredMedia} selectedIds={selectedIds} onToggleSelect={toggleSelect} onTagProducts={openTagModal} />
          ) : (
            <MediaTable media={filteredMedia} selectedIds={selectedIds} onToggleSelect={toggleSelect} onTagProducts={openTagModal} />
          )}
        </div>
      </div>

      <UploadModal
        open={openModal}
        closeModal={resetUploadModal}
        uploadTab={uploadTab}
        switchUploadTab={switchUploadTab}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        remoteUrl={remoteUrl}
        setRemoteUrl={setRemoteUrl}
        remoteConsent={remoteConsent}
        setRemoteConsent={setRemoteConsent}
        uploadFile={uploadFile}
        importFromUrl={importFromUrl}
        uploading={uploading}
        uploadError={uploadError}
      />

      <TagProductsModal
        open={tagModalOpen}
        item={taggingItem}
        products={products}
        productQuery={productQuery}
        setProductQuery={setProductQuery}
        selectedProductIds={selectedProductIds}
        onToggleProduct={toggleProductSelection}
        onSearch={() => loadProducts(productQuery)}
        onClose={closeTagModal}
        onSave={saveProductTags}
        loading={productsLoading}
        saving={savingTags}
        error={tagError}
      />

    </div>
  );
}

function MediaGrid({ media, selectedIds, onToggleSelect, onTagProducts }) {
  if (media.length === 0) {
    return <EmptyMediaState />;
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(228px, 228px))",
      gap: "20px"
    }}>

      {media.map((item) => (

        <MediaCard
          key={item.id}
          item={item}
          isSelected={selectedIds.includes(item.id)}
          onToggleSelect={onToggleSelect}
          onTagProducts={onTagProducts}
        />

      ))}

    </div>
  );
}

function MediaTable({ media, selectedIds, onToggleSelect, onTagProducts }) {
  if (media.length === 0) {
    return <EmptyMediaState />;
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #d9dce1", borderRadius: "16px", overflow: "hidden" }}>
      <div style={{ color: "#6b7280", display: "grid", fontSize: "12px", fontWeight: 700, gridTemplateColumns: "50px 1.3fr 120px 120px", letterSpacing: "0.03em", padding: "14px 18px", textTransform: "uppercase" }}>
        <span>Select</span>
        <span>Item</span>
        <span>Type</span>
        <span>Status</span>
      </div>
      {media.map((item) => (
        <div key={item.id} style={{ alignItems: "center", borderTop: "1px solid #eef1f4", display: "grid", gridTemplateColumns: "50px 1.3fr 120px 120px", padding: "14px 18px" }}>
          <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => onToggleSelect(item.id)} />
          <div style={{ alignItems: "center", display: "flex", gap: "12px", minWidth: 0 }}>
            <img src={item.thumbnail || item.url} style={{ borderRadius: "10px", height: "56px", objectFit: "cover", width: "42px" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#111827", fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {getMediaTitle(item)}
              </div>
              <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "3px" }}>
                {item.type === "VIDEO" ? "Video asset" : "Image asset"}
              </div>
            </div>
          </div>
          <span style={{ color: "#374151", fontSize: "14px" }}>{item.type === "VIDEO" ? "Video" : "Image"}</span>
          <div style={{ alignItems: "center", display: "flex", gap: "8px", justifyContent: "space-between" }}>
            <span style={{ color: "#0f766e", fontSize: "14px", fontWeight: 600 }}>Ready</span>
            <button type="button" onClick={() => onTagProducts(item)} style={{ background: "#111827", border: "none", borderRadius: "999px", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 600, padding: "6px 10px" }}>
              Tag Products
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MediaCard({ item, isSelected, onToggleSelect, onTagProducts }) {

  const [hover, setHover] = useState(false);
  const title = getMediaTitle(item);

  return (

    <div
      style={{
        position: "relative",
        borderRadius: "16px",
        overflow: "hidden",
        border: isSelected ? "2px solid #111827" : "1px solid #d9dce1",
        cursor: "pointer",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        padding: "10px 10px 12px",
        width: "228px",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >

      <div style={{ color: "#303030", fontSize: "13px", fontWeight: 600, marginBottom: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title}
      </div>

      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(item.id)}
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          width: "18px",
          height: "18px",
          zIndex: 3,
          cursor: "pointer",
          opacity: hover || isSelected ? 1 : 0,
        }}
      />

      <div style={{ position: "absolute", right: "16px", top: "50px", zIndex: 2 }}>
        <span style={{ alignItems: "center", background: "rgba(17, 24, 39, 0.72)", borderRadius: "999px", color: "#fff", display: "inline-flex", fontSize: "12px", height: "24px", justifyContent: "center", width: "24px" }}>
          ◌
        </span>
      </div>

      <div style={{ borderRadius: "14px", overflow: "hidden", position: "relative" }}>
        {item.type === "VIDEO" ? (

          hover ? (

            <video
              src={item.url}
              autoPlay
              muted
              loop
              controls
              style={{ aspectRatio: "9 / 16", display: "block", objectFit: "cover", width: "100%" }}
            />

          ) : (

            <img
              src={item.thumbnail || item.url}
              style={{ aspectRatio: "9 / 16", display: "block", objectFit: "cover", width: "100%" }}
            />

          )

        ) : (

          <img
            src={item.url}
            style={{ aspectRatio: "9 / 16", display: "block", objectFit: "cover", width: "100%" }}
          />

        )}

        <div style={{ bottom: "12px", left: "12px", position: "absolute" }}>
          <button type="button" onClick={() => onTagProducts(item)} style={{ background: "rgba(17, 24, 39, 0.84)", border: "none", borderRadius: "999px", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 600, padding: "7px 12px" }}>
            Tag Products
          </button>
        </div>
      </div>

    </div>
  );
}

function ToolbarButton({ children, onClick, disabled, variant }) {
  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled
          ? "var(--p-color-bg-fill-disabled)"
          : isPrimary
            ? "var(--p-color-bg-fill-brand)"
            : "var(--p-color-bg-surface)",
        border: `1px solid ${isPrimary ? "var(--p-color-border-brand)" : "var(--p-color-border-secondary)"}`,
        borderRadius: "10px",
        boxShadow: isPrimary ? "inset 0 -1px 0 rgba(0,0,0,0.12)" : "none",
        color: isPrimary ? "var(--p-color-text-inverse)" : disabled ? "var(--p-color-text-disabled)" : "var(--p-color-text)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: "14px",
        fontWeight: 600,
        opacity: disabled ? 0.7 : 1,
        padding: "10px 14px",
      }}
    >
      {children}
    </button>
  );
}

function ViewModeToggle({ viewMode, setViewMode }) {
  return (
    <div style={{ alignItems: "center", background: "#fff", border: "1px solid #d9dce1", borderRadius: "12px", display: "inline-flex", padding: "3px" }}>
      <button type="button" onClick={() => setViewMode("grid")} style={viewModeButtonStyle(viewMode === "grid")}>
        ▦ Grid view
      </button>
      <button type="button" onClick={() => setViewMode("table")} style={viewModeButtonStyle(viewMode === "table")}>
        ☷ Table view
      </button>
    </div>
  );
}

function FilterChip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "#f3f4f6" : "transparent",
        border: "none",
        borderRadius: "12px",
        color: "#303030",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: active ? 700 : 500,
        padding: "10px 14px",
      }}
    >
      {children}
    </button>
  );
}

function IconButton({ label, children, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        alignItems: "center",
        background: "#fff",
        border: "1px solid #d9dce1",
        borderRadius: "12px",
        color: "#374151",
        cursor: "pointer",
        display: "inline-flex",
        fontSize: "16px",
        height: "36px",
        justifyContent: "center",
        width: "36px",
      }}
    >
      {children}
    </button>
  );
}

function EmptyMediaState() {
  return (
    <div style={{ alignItems: "center", background: "#fff", border: "1px dashed #d9dce1", borderRadius: "18px", color: "#6b7280", display: "flex", justifyContent: "center", minHeight: "220px" }}>
      No media items yet.
    </div>
  );
}

function getMediaTitle(item) {
  const source = item?.url || item?.thumbnail || "";

  try {
    const url = new URL(source);
    const lastSegment = url.pathname.split("/").filter(Boolean).pop() || "Untitled media";
    return decodeURIComponent(lastSegment).replace(/\.(mp4|mov|webm|m4v|avi|mkv|jpg|jpeg|png|gif|webp|avif)$/i, "");
  } catch {
    return "Untitled media";
  }
}

function viewModeButtonStyle(active) {
  return {
    background: active ? "#e5e7eb" : "transparent",
    border: "none",
    borderRadius: "10px",
    color: "#303030",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    padding: "9px 12px",
  };
}
function UploadModal({
  open,
  closeModal,
  uploadTab,
  switchUploadTab,
  selectedFile,
  setSelectedFile,
  remoteUrl,
  setRemoteUrl,
  remoteConsent,
  setRemoteConsent,
  uploadFile,
  importFromUrl,
  uploading,
  uploadError
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const isUploadTab = uploadTab === "upload";
  const isInstagramTab = uploadTab === "instagram";
  const urlLabel = isInstagramTab ? "Instagram URL" : "TikTok URL";
  const urlPlaceholder = isInstagramTab
    ? "https://www.instagram.com/reel/..."
    : "https://www.tiktok.com/@user/video/...";
  const urlHelpText = isInstagramTab
    ? "Enter a valid Instagram post, reel, or TV URL"
    : "Enter a valid TikTok post URL";
  const primaryAction = isUploadTab
    ? {
        content: uploading ? "Uploading..." : "Start Upload",
        onAction: uploadFile,
        disabled: !selectedFile || uploading,
      }
    : {
        content: uploading ? "Finding media..." : "Find media",
        onAction: importFromUrl,
        disabled: !remoteUrl.trim() || !remoteConsent || uploading,
      };

  const tabButtonStyle = (active) => ({
    alignItems: "center",
    background: active ? "#eef4ff" : "transparent",
    border: active ? "2px solid #0b63ce" : "1px solid transparent",
    borderRadius: "12px",
    color: "#303030",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: "14px",
    fontWeight: active ? 600 : 500,
    gap: "8px",
    padding: "8px 14px",
  });

  return (
    <OverlayModal
      open={open}
      onClose={closeModal}
      title="Add new content"
      primaryAction={primaryAction}
      secondaryAction={{
        content: "Cancel",
        onAction: closeModal,
      }}
    >

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button type="button" style={tabButtonStyle(uploadTab === "upload")} onClick={() => switchUploadTab("upload")}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>UP</span>
            <span>Upload</span>
          </button>
          <button type="button" style={tabButtonStyle(uploadTab === "instagram")} onClick={() => switchUploadTab("instagram")}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>IG</span>
            <span>Instagram</span>
          </button>
          <button type="button" style={tabButtonStyle(uploadTab === "tiktok")} onClick={() => switchUploadTab("tiktok")}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>TT</span>
            <span>TikTok</span>
          </button>
        </div>

        {isUploadTab ? (
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              background: isDragging ? "var(--p-color-bg-surface-selected)" : "var(--p-color-bg-surface-secondary)",
              border: isDragging ? "2px dashed var(--p-color-border-emphasis)" : "2px dashed var(--p-color-border)",
              borderRadius: "12px",
              cursor: "pointer",
              padding: "40px",
              textAlign: "center",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            {isDragging ? (
              <p style={{ color: "var(--p-color-text-emphasis)", fontSize: "15px", fontWeight: 600, margin: 0 }}>
                Drop your file here
              </p>
            ) : (
              <>
                <p style={{ color: "var(--p-color-text-secondary)", fontSize: "14px", margin: "0 0 12px" }}>
                  Drag &amp; drop a video or image here, or
                </p>
                <label
                  htmlFor="media-upload-input"
                  style={{
                    background: "var(--p-color-bg-fill-brand)",
                    borderRadius: "8px",
                    color: "var(--p-color-text-inverse)",
                    cursor: "pointer",
                    display: "inline-block",
                    fontSize: "14px",
                    fontWeight: 600,
                    padding: "8px 20px",
                  }}
                >
                  Choose Files
                </label>
                <p style={{ color: "var(--p-color-text-tertiary)", fontSize: "12px", margin: "10px 0 0" }}>
                  Max file size: 30MB
                </p>
              </>
            )}

            <input
              id="media-upload-input"
              type="file"
              accept="video/*,image/*"
              style={{ display: "none" }}
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />

            {selectedFile && !isDragging && (
              <p style={{ color: "var(--p-color-text)", fontSize: "13px", marginTop: "12px" }}>
                Selected: <strong>{selectedFile.name}</strong>
              </p>
            )}

            {uploadError && <p style={{ color: "var(--p-color-text-critical)", marginTop: "10px" }}>{uploadError}</p>}

          </div>
        ) : (
          <div>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
              {urlLabel}
            </label>

            <input
              type="url"
              value={remoteUrl}
              onChange={(event) => setRemoteUrl(event.target.value)}
              placeholder={urlPlaceholder}
              style={{
                border: "1px solid #8a8a8a",
                borderRadius: "10px",
                fontSize: "14px",
                outline: "none",
                padding: "10px 12px",
                width: "100%",
              }}
            />

            <div style={{ color: "#616161", fontSize: "13px", marginTop: "8px" }}>
              {urlHelpText}
            </div>

            <div
              style={{
                alignItems: "center",
                background: "#e9f2ff",
                borderRadius: "10px",
                color: "#0b63ce",
                display: "flex",
                gap: "10px",
                marginTop: "18px",
                padding: "12px 14px",
              }}
            >
              <span style={{ fontWeight: 700 }}>i</span>
              <span style={{ color: "#0f172a", fontSize: "14px" }}>
                Only publicly accessible direct media URLs can be imported for now.
              </span>
            </div>

            <label style={{ alignItems: "flex-start", display: "flex", gap: "10px", marginTop: "18px" }}>
              <input
                type="checkbox"
                checked={remoteConsent}
                onChange={(event) => setRemoteConsent(event.target.checked)}
                style={{ marginTop: "3px" }}
              />
              <span style={{ color: "#303030", fontSize: "14px" }}>
                I confirm that I have obtained the necessary permissions, copyrights, and authorizations.
              </span>
            </label>

            {uploadError && (
              <div style={{ marginTop: "14px" }}>
                <p style={{ color: "#b91c1c", margin: 0 }}>{uploadError}</p>
              </div>
            )}
          </div>
        )}

    </OverlayModal>
  );
}

function TagProductsModal({
  open,
  item,
  products,
  productQuery,
  setProductQuery,
  selectedProductIds,
  onToggleProduct,
  onSearch,
  onClose,
  onSave,
  loading,
  saving,
  error,
}) {
  const title = item ? `Tag Products - ${getMediaTitle(item)}` : "Tag Products";

  return (
    <OverlayModal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={{
        content: saving ? "Saving..." : "Save Tags",
        onAction: onSave,
        disabled: saving,
      }}
      secondaryAction={{ content: "Cancel", onAction: onClose }}
    >
      <div>
        <div style={{ background: "#e9f2ff", borderRadius: "10px", color: "#0f172a", fontSize: "14px", marginBottom: "10px", padding: "12px 14px" }}>
          Info: Only active and published products are available for tagging. Draft, archived, or unpublished products will not appear in this list.
        </div>
        <div style={{ background: "#fff4e5", borderRadius: "10px", color: "#5c3b00", fontSize: "14px", marginBottom: "16px", padding: "12px 14px" }}>
          You can link one or more products to this media item.
        </div>

        <div style={{ alignItems: "center", borderBottom: "1px solid #e5e7eb", display: "flex", gap: "8px", paddingBottom: "10px" }}>
          <input
            type="text"
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            placeholder="Search products"
            style={{ border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px", padding: "10px 12px", width: "100%" }}
          />
          <IconButton label="Search" onClick={onSearch}>⌕</IconButton>
          <IconButton label="Reload" onClick={() => { setProductQuery(""); onSearch(); }}>↻</IconButton>
        </div>

        <div style={{ color: "#6b7280", fontSize: "13px", marginTop: "10px" }}>
          {selectedProductIds.length} product{selectedProductIds.length === 1 ? "" : "s"} selected
        </div>

        <div style={{ marginTop: "12px", maxHeight: "300px", overflow: "auto" }}>
          {loading ? (
            <div style={{ color: "#6b7280", padding: "30px 0", textAlign: "center" }}>Loading products...</div>
          ) : products.length === 0 ? (
            <div style={{ alignItems: "center", color: "#6b7280", display: "flex", flexDirection: "column", gap: "8px", padding: "42px 10px", textAlign: "center" }}>
              <div style={{ fontSize: "56px", lineHeight: 1 }}>⌕</div>
              <div style={{ color: "#111827", fontSize: "36px", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                No products found
              </div>
              <div style={{ fontSize: "15px" }}>
                Try a different search term or remove filters.
              </div>
            </div>
          ) : (
            products.map((product) => (
              <label key={product.id} style={{ alignItems: "center", borderBottom: "1px solid #f3f4f6", cursor: "pointer", display: "grid", gap: "10px", gridTemplateColumns: "22px 48px 1fr", padding: "10px 4px" }}>
                <input
                  type="checkbox"
                  checked={selectedProductIds.includes(product.id)}
                  onChange={() => onToggleProduct(product.id)}
                />
                <div style={{ borderRadius: "8px", height: "48px", overflow: "hidden", width: "48px" }}>
                  {product.image ? (
                    <img src={product.image} alt={product.title} style={{ height: "100%", objectFit: "cover", width: "100%" }} />
                  ) : (
                    <div style={{ alignItems: "center", background: "#f3f4f6", color: "#9ca3af", display: "flex", fontSize: "12px", height: "100%", justifyContent: "center", width: "100%" }}>
                      No image
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: "#111827", fontSize: "14px", fontWeight: 600 }}>{product.title}</div>
                  <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "2px" }}>{product.status}</div>
                </div>
              </label>
            ))
          )}
        </div>

        {error && (
          <div style={{ marginTop: "10px" }}>
            <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
          </div>
        )}
      </div>
    </OverlayModal>
  );
}

function OverlayModal({
  open,
  onClose,
  title,
  primaryAction,
  secondaryAction,
  children,
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 24, 39, 0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "85vh",
          overflow: "auto",
          borderRadius: "14px",
          background: "#ffffff",
          border: "1px solid #d9dce1",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.28)",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <h2 style={{ margin: 0, fontSize: "20px", color: "#111827" }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: "20px", cursor: "pointer", color: "#6b7280" }}>
            ×
          </button>
        </div>

        <div style={{ padding: "16px" }}>{children}</div>

        <div style={{ alignItems: "center", display: "flex", justifyContent: "flex-end", gap: "10px", padding: "12px 16px", borderTop: "1px solid #e5e7eb" }}>
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onAction}
              style={{
                background: "#fff",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              {secondaryAction.content}
            </button>
          ) : null}

          {primaryAction ? (
            <button
              type="button"
              onClick={primaryAction.onAction}
              disabled={primaryAction.disabled}
              style={{
                background: primaryAction.disabled ? "#9ca3af" : "#111827",
                color: "#fff",
                border: "1px solid #111827",
                borderRadius: "10px",
                padding: "8px 14px",
                cursor: primaryAction.disabled ? "not-allowed" : "pointer",
              }}
            >
              {primaryAction.content}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}