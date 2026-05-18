/** From shopify.app.toml `client_id` — used when resolving app-owned theme types from deploy. */
export const PLAYLIST_APP_CLIENT_ID = "d502b734f2ad37cf0eb3b63420b5d516";

/** Deployed app-owned picker id (shopify.app.toml); exists after `shopify app deploy` on install. */
export const PLAYLIST_APP_THEME_METAOBJECT_TYPE = `app--${PLAYLIST_APP_CLIENT_ID}-vinci_playlist`;

/** GraphQL / TOML app-owned type. */
export const PLAYLIST_APP_OWNED_METAOBJECT_TYPE = "$app:vinci_playlist";

/** Merchant-owned type (creatable via Admin API on every store). */
export const PLAYLIST_MERCHANT_METAOBJECT_TYPE = "vinci_playlist";

/**
 * Theme block `metaobject_type` — must match carrousel-block.liquid.
 */
export const PLAYLIST_THEME_METAOBJECT_TYPE = PLAYLIST_MERCHANT_METAOBJECT_TYPE;
