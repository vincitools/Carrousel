/** From shopify.app.toml `client_id` — used when resolving app-owned theme types from deploy. */
export const PLAYLIST_APP_CLIENT_ID = "d502b734f2ad37cf0eb3b63420b5d516";

/** Deployed app-owned picker id (shopify.app.toml); exists after `shopify app deploy` on install. */
export const PLAYLIST_APP_THEME_METAOBJECT_TYPE = `app--${PLAYLIST_APP_CLIENT_ID}-vinci_playlist`;

/**
 * Theme block `metaobject_type` — must match `[metaobjects.app.vinci_playlist]` in shopify.app.toml
 * and carrousel-block.liquid. Provisioned on every store when the app version is deployed/updated.
 */
export const PLAYLIST_THEME_METAOBJECT_TYPE = PLAYLIST_APP_THEME_METAOBJECT_TYPE;

/** GraphQL / TOML app-owned type. */
export const PLAYLIST_APP_OWNED_METAOBJECT_TYPE = "$app:vinci_playlist";

/** Merchant-owned fallback (older installs). */
export const PLAYLIST_MERCHANT_METAOBJECT_TYPE = "vinci_playlist";
