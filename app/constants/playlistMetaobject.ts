/** From shopify.app.toml `client_id` (Admin API key — not the Theme Editor metaobject type prefix). */
export const PLAYLIST_APP_CLIENT_ID = "d502b734f2ad37cf0eb3b63420b5d516";

/**
 * Shopify Partner numeric app id used in deployed metaobject types.
 * Format on shop: `app--{numericId}--vinci_playlist` (see Content → Metaobjects).
 * Override with SHOPIFY_APP_NUMERIC_ID on Render if needed.
 */
export const PLAYLIST_APP_NUMERIC_ID =
  (typeof process !== "undefined" && process.env?.SHOPIFY_APP_NUMERIC_ID?.trim()) || "313024774145";

/** Theme block `metaobject_type` — must match carrousel-block.liquid exactly. */
export const PLAYLIST_APP_THEME_METAOBJECT_TYPE = `app--${PLAYLIST_APP_NUMERIC_ID}--vinci_playlist`;

/** GraphQL / TOML app-owned type alias. */
export const PLAYLIST_APP_OWNED_METAOBJECT_TYPE = "$app:vinci_playlist";

/** Legacy merchant-owned type (optional fallback). */
export const PLAYLIST_MERCHANT_METAOBJECT_TYPE = "vinci_playlist";

/** @deprecated Wrong format (client_id hex + single dash) — do not use in theme schema. */
export const PLAYLIST_APP_THEME_METAOBJECT_TYPE_LEGACY = `app--${PLAYLIST_APP_CLIENT_ID}-vinci_playlist`;

export const PLAYLIST_THEME_METAOBJECT_TYPE = PLAYLIST_APP_THEME_METAOBJECT_TYPE;
