import prisma from "../db.server";
import {
  PLAYLIST_APP_OWNED_METAOBJECT_TYPE,
  PLAYLIST_APP_THEME_METAOBJECT_TYPE,
  PLAYLIST_MERCHANT_METAOBJECT_TYPE,
  PLAYLIST_THEME_METAOBJECT_TYPE,
} from "../constants/playlistMetaobject";
import { apiVersion } from "../shopify.server";

const PLAYLIST_METAOBJECT_TYPE = PLAYLIST_APP_OWNED_METAOBJECT_TYPE;
const LEGACY_METAOBJECT_TYPE_PLAIN = PLAYLIST_MERCHANT_METAOBJECT_TYPE;

export { PLAYLIST_THEME_METAOBJECT_TYPE } from "../constants/playlistMetaobject";

const CUID_LIKE = /^c[a-z0-9]{24}$/i;

/**
 * Theme editor shows the metaobject handle in the picker — use the playlist name, not the DB id.
 * Suffix keeps the handle unique and stable when the title changes.
 */
function buildPlaylistMetaobjectHandle(name: string, playlistId: string) {
  const rawSuffix = playlistId.replace(/[^a-z0-9]/gi, "").slice(-14);
  const suffix = rawSuffix.length >= 8 ? rawSuffix : playlistId.replace(/[^a-z0-9-]/gi, "").slice(-14) || "id";

  let slug = String(name || "playlist")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);

  if (!slug) slug = "playlist";

  return `${slug}-${suffix}`;
}

function fieldsArrayToMap(fields: Array<{ key: string; value?: string | null }> | undefined) {
  const map: Record<string, string> = {};
  if (!fields) return map;
  for (const f of fields) {
    if (f.key && f.value != null && String(f.value).trim().length > 0) {
      map[f.key] = String(f.value).trim();
    }
  }
  return map;
}

/** Resolve internal playlist id from fields or from legacy handle (= Prisma cuid). */
function resolvePlaylistIdFromMetaobject(handle: string, fieldMap: Record<string, string>) {
  if (fieldMap.playlist_id) return fieldMap.playlist_id;
  const h = String(handle || "").trim();
  if (CUID_LIKE.test(h)) return h;
  return "";
}

function attachPlaylistIdsFromKnownHandles(
  entries: PlaylistMetaobjectNode[],
  playlistIds: Set<string>,
): PlaylistMetaobjectNode[] {
  return entries.map((e) => {
    if (e.playlistIdFromField) return e;
    const h = e.handle.trim();
    if (playlistIds.has(h)) return { ...e, playlistIdFromField: h };
    return e;
  });
}

function adminGraphqlUrl(shopDomain: string) {
  const version = typeof apiVersion === "string" ? apiVersion : String(apiVersion);
  return `https://${shopDomain}/admin/api/${version}/graphql.json`;
}

/** Used for titles in Shopify Admin / Content > Metaobjects (modal header uses displayNameKey). */
const PLAYLIST_DISPLAY_NAME_FIELD_KEY = "playlist_name";

const GET_DEFINITION_QUERY = `
  query GetPlaylistMetaobjectDefinition($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
      name
      displayNameKey
    }
  }
`;

const LIST_DEFINITIONS_QUERY = `
  query ListMetaobjectDefinitions($first: Int!) {
    metaobjectDefinitions(first: $first) {
      nodes {
        id
        type
        name
      }
    }
  }
`;

const CREATE_DEFINITION_MUTATION = `
  mutation CreatePlaylistMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
        displayNameKey
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PATCH_DEFINITION_DISPLAY_NAME_MUTATION = `
  mutation PatchPlaylistMetaobjectDefinitionDisplayName($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition {
        id
        displayNameKey
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_METAOBJECTS_QUERY = `
  query ListPlaylistMetaobjects($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      nodes {
        id
        handle
        fields {
          key
          value
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_METAOBJECT_MUTATION = `
  mutation CreatePlaylistMetaobject($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_METAOBJECT_MUTATION = `
  mutation UpdatePlaylistMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_METAOBJECT_MUTATION = `
  mutation DeletePlaylistMetaobject($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

async function shopifyGraphql<T>({
  shopDomain,
  accessToken,
  query,
  variables,
}: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(adminGraphqlUrl(shopDomain), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as T & { errors?: Array<{ message: string }> };
  if (!response.ok || payload?.errors?.length) {
    throw new Error(payload?.errors?.map((error) => error.message).join("; ") || "Shopify GraphQL request failed");
  }

  return payload;
}

/**
 * Resolve every playlist metaobject definition available in this shop.
 * Theme editor may read the plain type in older installs, even when app-owned exists.
 */
async function definitionExists(shopDomain: string, accessToken: string, type: string) {
  const result = await shopifyGraphql<{
    data?: { metaobjectDefinitionByType?: { id: string } | null };
  }>({
    shopDomain,
    accessToken,
    query: GET_DEFINITION_QUERY,
    variables: { type },
  }).catch(() => ({ data: undefined }));

  return Boolean(result?.data?.metaobjectDefinitionByType?.id);
}

function isPlaylistMetaobjectType(type: string) {
  const normalized = String(type || "").toLowerCase();
  return normalized.includes("vinci_playlist");
}

const APP_OWNED_THEME_TYPE_PATTERN = /^app--\d+--vinci_playlist$/;

/** Prefer the app-owned type Shopify created from TOML (`app--{numericId}--vinci_playlist`). */
async function discoverAppOwnedThemeMetaobjectType(
  shopDomain: string,
  accessToken: string,
): Promise<string | null> {
  if (await definitionExists(shopDomain, accessToken, PLAYLIST_APP_THEME_METAOBJECT_TYPE)) {
    return PLAYLIST_APP_THEME_METAOBJECT_TYPE;
  }

  try {
    const listed = await shopifyGraphql<{
      data?: { metaobjectDefinitions?: { nodes?: Array<{ type?: string }> } };
    }>({
      shopDomain,
      accessToken,
      query: LIST_DEFINITIONS_QUERY,
      variables: { first: 50 },
    });

    for (const node of listed?.data?.metaobjectDefinitions?.nodes || []) {
      const type = String(node?.type || "");
      if (APP_OWNED_THEME_TYPE_PATTERN.test(type)) {
        return type;
      }
    }
  } catch (error) {
    console.warn("[playlist-metaobject-sync] discover app-owned theme type failed", error);
  }

  return null;
}

async function isThemePickerReady(shopDomain: string, accessToken: string) {
  return Boolean(await discoverAppOwnedThemeMetaobjectType(shopDomain, accessToken));
}

async function resolveThemePickerMetaobjectType(
  shopDomain: string,
  accessToken: string,
): Promise<string | null> {
  return discoverAppOwnedThemeMetaobjectType(shopDomain, accessToken);
}

async function hasAppOwnedPlaylistDefinition(shopDomain: string, accessToken: string) {
  if (await definitionExists(shopDomain, accessToken, PLAYLIST_APP_THEME_METAOBJECT_TYPE)) {
    return true;
  }
  return definitionExists(shopDomain, accessToken, PLAYLIST_APP_OWNED_METAOBJECT_TYPE);
}

async function discoverPlaylistMetaobjectTypes(
  shopDomain: string,
  accessToken: string,
): Promise<string[]> {
  const found = new Set<string>();

  for (const type of [
    PLAYLIST_APP_THEME_METAOBJECT_TYPE,
    PLAYLIST_APP_OWNED_METAOBJECT_TYPE,
    PLAYLIST_THEME_METAOBJECT_TYPE,
    PLAYLIST_METAOBJECT_TYPE,
    PLAYLIST_MERCHANT_METAOBJECT_TYPE,
  ]) {
    if (await definitionExists(shopDomain, accessToken, type)) {
      found.add(type);
    }
  }

  try {
    const listed = await shopifyGraphql<{
      data?: { metaobjectDefinitions?: { nodes?: Array<{ type?: string }> } };
    }>({
      shopDomain,
      accessToken,
      query: LIST_DEFINITIONS_QUERY,
      variables: { first: 50 },
    });

    for (const node of listed?.data?.metaobjectDefinitions?.nodes || []) {
      if (node?.type && isPlaylistMetaobjectType(node.type)) {
        found.add(node.type);
      }
    }
  } catch (error) {
    console.warn("[playlist-metaobject-sync] list metaobject definitions failed", error);
  }

  return Array.from(found);
}

function buildPlaylistDefinitionInput(type: string) {
  return {
    name: "Vinci Shoppable Videos Playlists",
    type,
    displayNameKey: PLAYLIST_DISPLAY_NAME_FIELD_KEY,
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "PUBLIC_READ",
    },
    fieldDefinitions: [
      {
        key: "playlist_name",
        name: "Playlist Name",
        type: "single_line_text_field",
        required: true,
      },
      {
        key: "playlist_id",
        name: "Playlist ID",
        type: "single_line_text_field",
        required: true,
      },
    ],
  };
}

export type ThemePickerProvisionResult = {
  ready: boolean;
  definitionType: string | null;
  createErrors: string[];
  syncedTypes: string[];
};

export type ThemePlaylistPickerStatus = {
  definitionReady: boolean;
  needsAppUpdate: boolean;
  /** True when an older app-owned definition also exists on the shop. */
  hasLegacyMerchantDefinition: boolean;
  expectedType: string;
  types: string[];
  provisionErrors: string[];
  entryCount: number;
  playlistCount: number;
  message: string;
};

function buildThemePickerMessage(input: {
  definitionReady: boolean;
  entryCount: number;
  playlistCount: number;
  hasLegacyMerchantDefinition: boolean;
  provisionErrors: string[];
}): string {
  if (input.definitionReady && input.entryCount > 0) {
    return `Theme Editor dropdown is ready (${input.entryCount} playlist${input.entryCount === 1 ? "" : "s"} synced). Refresh the Theme Editor to pick one.`;
  }
  if (input.definitionReady && input.playlistCount > 0 && input.entryCount === 0) {
    return "Definition is ready but entries are missing. Click Sync for Theme Editor below.";
  }
  if (input.definitionReady) {
    return "Definition is ready. Create a playlist here, sync, then refresh the Theme Editor.";
  }
  if (input.provisionErrors.length > 0) {
    return `Theme picker setup failed: ${input.provisionErrors.join("; ")}`;
  }
  return "Theme picker definition is missing. Open Playlists in this app and click Sync for Theme Editor, then refresh the Theme Editor.";
}

async function createPlaylistMetaobjectDefinition(
  shopDomain: string,
  accessToken: string,
  type: string,
): Promise<{ ok: boolean; errors: string[]; createdType?: string }> {
  try {
    const created = await shopifyGraphql<{
      data?: {
        metaobjectDefinitionCreate?: {
          metaobjectDefinition?: { id: string; type?: string };
          userErrors?: Array<{ message: string }>;
        };
      };
    }>({
      shopDomain,
      accessToken,
      query: CREATE_DEFINITION_MUTATION,
      variables: { definition: buildPlaylistDefinitionInput(type) },
    });

    const errors = created?.data?.metaobjectDefinitionCreate?.userErrors || [];
    if (errors.length > 0) {
      const alreadyExists = errors.some((error) =>
        /taken|already|exists|reserved/i.test(error.message || ""),
      );
      if (alreadyExists) {
        return { ok: true, errors: [] };
      }
      const messages = errors.map((error) => error.message).filter(Boolean);
      console.error(
        "[playlist-metaobject-sync] create definition userErrors",
        shopDomain,
        type,
        JSON.stringify(errors),
      );
      return { ok: false, errors: messages };
    }

    const createdType = created?.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.type || type;
    console.log("[playlist-metaobject-sync] created definition", shopDomain, createdType);
    return { ok: true, errors: [], createdType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[playlist-metaobject-sync] create definition failed", shopDomain, type, error);
    return { ok: false, errors: [message] };
  }
}

/**
 * Ensures the metaobject definition required by the theme block picker exists.
 * Theme schema uses app-owned type `app--{numericAppId}--vinci_playlist` from TOML deploy.
 */
export async function ensurePlaylistMetaobjectDefinitionForShop(
  shopDomain: string,
  accessToken: string,
): Promise<boolean> {
  const result = await provisionThemePlaylistPicker(shopDomain, accessToken);
  return result.ready;
}

/** Ensures the app-owned theme picker definition exists (from deploy or $app GraphQL create). */
export async function provisionThemePlaylistPicker(
  shopDomain: string,
  accessToken: string,
): Promise<ThemePickerProvisionResult> {
  const createErrors: string[] = [];

  const existing = await discoverAppOwnedThemeMetaobjectType(shopDomain, accessToken);
  if (existing) {
    return {
      ready: true,
      definitionType: existing,
      createErrors: [],
      syncedTypes: [],
    };
  }

  const appOwned = await createPlaylistMetaobjectDefinition(
    shopDomain,
    accessToken,
    PLAYLIST_APP_OWNED_METAOBJECT_TYPE,
  );
  if (!appOwned.ok) {
    createErrors.push(...appOwned.errors);
  }

  const afterCreate = await discoverAppOwnedThemeMetaobjectType(shopDomain, accessToken);
  if (afterCreate) {
    return {
      ready: true,
      definitionType: afterCreate,
      createErrors,
      syncedTypes: [],
    };
  }

  console.error(
    "[playlist-metaobject-sync] Theme picker definition still missing for",
    shopDomain,
    "expected",
    PLAYLIST_APP_THEME_METAOBJECT_TYPE,
    createErrors.length
      ? createErrors.join("; ")
      : "run shopify app deploy and have the merchant update the app in Admin → Apps",
  );

  return {
    ready: false,
    definitionType: null,
    createErrors,
    syncedTypes: [],
  };
}

/** Run definition ensure + playlist entry sync (call after install / on app open). */
export async function setupThemePlaylistPickerForShop(
  shopId: string,
  overrides?: PlaylistMetaobjectSyncOverrides,
): Promise<ThemePlaylistPickerStatus> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopDomain: true, accessToken: true },
  });

  const shopDomain = overrides?.shopDomain || shop?.shopDomain;
  const accessToken = overrides?.accessToken || shop?.accessToken;

  if (!shopDomain || !accessToken || accessToken === "dev-token") {
    return {
      definitionReady: false,
      needsAppUpdate: true,
      hasLegacyMerchantDefinition: false,
      expectedType: PLAYLIST_THEME_METAOBJECT_TYPE,
      types: [],
      provisionErrors: [],
      entryCount: 0,
      playlistCount: 0,
      message: "Open this app inside Shopify Admin to connect your store.",
    };
  }

  const provision = await provisionThemePlaylistPicker(shopDomain, accessToken);
  await syncPlaylistMetaobjectsForShop(shopId, overrides);
  const types = await discoverPlaylistMetaobjectTypes(shopDomain, accessToken);
  const activePickerType =
    (await resolveThemePickerMetaobjectType(shopDomain, accessToken)) || provision.definitionType;
  const definitionReady = Boolean(activePickerType);
  const hasLegacyMerchantDefinition = await hasAppOwnedPlaylistDefinition(shopDomain, accessToken);
  const playlistCount = await prisma.playlist.count({ where: { shopId } });
  const entryCount = await countThemePickerEntries(shopDomain, accessToken);
  const provisionErrors = provision.createErrors;
  const message = buildThemePickerMessage({
    definitionReady,
    entryCount,
    playlistCount,
    hasLegacyMerchantDefinition,
    provisionErrors,
  });

  return {
    definitionReady,
    needsAppUpdate: !definitionReady,
    hasLegacyMerchantDefinition,
    expectedType: activePickerType || PLAYLIST_THEME_METAOBJECT_TYPE,
    types,
    provisionErrors,
    entryCount,
    playlistCount,
    message,
  };
}

async function resolveAvailablePlaylistMetaobjectTypes(
  shopDomain: string,
  accessToken: string,
): Promise<string[]> {
  const themeType = await resolveThemePickerMetaobjectType(shopDomain, accessToken);
  if (themeType) {
    return [themeType];
  }

  const discovered = await discoverPlaylistMetaobjectTypes(shopDomain, accessToken);
  if (discovered.length > 0) {
    const ordered = [
      PLAYLIST_THEME_METAOBJECT_TYPE,
      PLAYLIST_MERCHANT_METAOBJECT_TYPE,
      PLAYLIST_APP_THEME_METAOBJECT_TYPE,
      PLAYLIST_APP_OWNED_METAOBJECT_TYPE,
      ...discovered,
    ];
    return Array.from(new Set(ordered.filter((type) => discovered.includes(type))));
  }

  console.warn(
    "[playlist-metaobject-sync] No playlist metaobject definition found for",
    shopDomain,
    "— run shopify app deploy and open the app in Admin.",
  );
  return [];
}

/**
 * Admin modal title uses the definition's display name field ("playlist_name"), not the internal handle.
 * Older installs may have displayNameKey unset — patch via API when Shopify allows it (fails silently for strict declarative defs).
 */
async function patchMetaobjectDefinitionDisplayNameKey(
  shopDomain: string,
  accessToken: string,
  metaobjectType: string,
) {
  try {
    const result = await shopifyGraphql<{
      data?: {
        metaobjectDefinitionByType?: { id: string; displayNameKey?: string | null } | null;
      };
    }>({
      shopDomain,
      accessToken,
      query: GET_DEFINITION_QUERY,
      variables: { type: metaobjectType },
    });

    const def = result?.data?.metaobjectDefinitionByType;
    if (!def?.id) return;

    if (def.displayNameKey === PLAYLIST_DISPLAY_NAME_FIELD_KEY) return;

    const patched = await shopifyGraphql<{
      data?: {
        metaobjectDefinitionUpdate?: {
          metaobjectDefinition?: { displayNameKey?: string | null };
          userErrors?: Array<{ message: string }>;
        };
      };
    }>({
      shopDomain,
      accessToken,
      query: PATCH_DEFINITION_DISPLAY_NAME_MUTATION,
      variables: {
        id: def.id,
        definition: { displayNameKey: PLAYLIST_DISPLAY_NAME_FIELD_KEY },
      },
    });

    const errors = patched?.data?.metaobjectDefinitionUpdate?.userErrors || [];
    if (errors.length > 0) {
      console.warn(
        "[playlist-metaobject-sync] Could not set displayNameKey on definition",
        metaobjectType,
        "(declarative definitions may require a new `shopify app deploy`):",
        JSON.stringify(errors),
      );
    }
  } catch (error) {
    console.warn("[playlist-metaobject-sync] patch displayNameKey skipped for", metaobjectType, error);
  }
}

type PlaylistMetaobjectNode = {
  id: string;
  handle: string;
  /** Resolved Prisma playlist id (field or legacy handle). */
  playlistIdFromField: string;
};

type PlaylistMetaobjectsListPayload = {
  data?: {
    metaobjects?: {
      nodes?: Array<{ id: string; handle: string; fields?: Array<{ key: string; value?: string | null }> }>;
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    };
  };
};

async function listMetaobjectsOfType(
  shopDomain: string,
  accessToken: string,
  metaobjectType: string,
): Promise<PlaylistMetaobjectNode[]> {
  let hasNextPage = true;
  let cursor: string | null = null;
  const nodes: PlaylistMetaobjectNode[] = [];

  while (hasNextPage) {
    const result: PlaylistMetaobjectsListPayload = await shopifyGraphql<PlaylistMetaobjectsListPayload>({
      shopDomain,
      accessToken,
      query: LIST_METAOBJECTS_QUERY,
      variables: {
        type: metaobjectType,
        first: 100,
        after: cursor,
      },
    });

    const pageNodes = result?.data?.metaobjects?.nodes || [];
    for (const node of pageNodes) {
      const fm = fieldsArrayToMap(node.fields);
      const playlistIdFromField = resolvePlaylistIdFromMetaobject(node.handle, fm);
      nodes.push({
        id: node.id,
        handle: node.handle,
        playlistIdFromField,
      });
    }

    hasNextPage = Boolean(result?.data?.metaobjects?.pageInfo?.hasNextPage);
    cursor = result?.data?.metaobjects?.pageInfo?.endCursor || null;
  }

  return nodes;
}

async function countThemePickerEntries(shopDomain: string, accessToken: string) {
  const pickerType = await resolveThemePickerMetaobjectType(shopDomain, accessToken);
  if (!pickerType) {
    return 0;
  }
  try {
    const entries = await listMetaobjectsOfType(shopDomain, accessToken, pickerType);
    return entries.length;
  } catch (error) {
    console.warn("[playlist-metaobject-sync] count theme picker entries failed", error);
    return 0;
  }
}

export type PlaylistMetaobjectSyncOverrides = {
  accessToken?: string;
  shopDomain?: string;
};

export async function syncPlaylistMetaobjectsForShop(shopId: string, overrides?: PlaylistMetaobjectSyncOverrides) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopDomain: true, accessToken: true },
  });

  const shopDomain = overrides?.shopDomain || shop?.shopDomain;
  const accessToken = overrides?.accessToken || shop?.accessToken;

  if (!shopDomain || !accessToken || accessToken === "dev-token") {
    return;
  }

  const definitionReady = await ensurePlaylistMetaobjectDefinitionForShop(shopDomain, accessToken);
  if (!definitionReady) {
    console.warn(
      "[playlist-metaobject-sync] Theme Editor playlist picker may stay disabled until definition is created for",
      shopDomain,
    );
  }

  const playlists = await prisma.playlist.findMany({
    where: { shopId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const metaobjectTypes = await resolveAvailablePlaylistMetaobjectTypes(shopDomain, accessToken);
  if (metaobjectTypes.length === 0) {
    return;
  }

  await patchMetaobjectDefinitionDisplayNameKey(shopDomain, accessToken, PLAYLIST_METAOBJECT_TYPE);
  await patchMetaobjectDefinitionDisplayNameKey(shopDomain, accessToken, LEGACY_METAOBJECT_TYPE_PLAIN);

  const desiredPlaylistIds = new Set(playlists.map((p) => p.id));

  for (const metaobjectType of metaobjectTypes) {
    let existing: PlaylistMetaobjectNode[] = [];
    try {
      existing = await listMetaobjectsOfType(shopDomain, accessToken, metaobjectType);
    } catch (error) {
      console.warn("[playlist-metaobject-sync] failed to list metaobjects", metaobjectType, error);
      continue;
    }

    existing = attachPlaylistIdsFromKnownHandles(existing, new Set(playlists.map((p) => p.id)));

    const existingByPlaylistId = new Map(
      existing.filter((e) => e.playlistIdFromField).map((e) => [e.playlistIdFromField, e]),
    );

    for (const playlist of playlists) {
      const current = existingByPlaylistId.get(playlist.id) || null;
      const fields = [
        { key: "playlist_id", value: playlist.id },
        { key: "playlist_name", value: playlist.name },
      ];
      const handle = buildPlaylistMetaobjectHandle(playlist.name, playlist.id);

      try {
        if (!current) {
          const created = await shopifyGraphql<{
            data?: {
              metaobjectCreate?: {
                metaobject?: { id: string };
                userErrors?: Array<{ message: string }>;
              };
            };
          }>({
            shopDomain,
            accessToken,
            query: CREATE_METAOBJECT_MUTATION,
            variables: {
              metaobject: {
                type: metaobjectType,
                handle,
                fields,
              },
            },
          });

          const errors = created?.data?.metaobjectCreate?.userErrors || [];
          if (errors.length > 0) {
            console.error("[playlist-metaobject-sync] create metaobject userErrors", metaobjectType, JSON.stringify(errors));
          }
        } else {
          const needsRename = current.handle !== handle;
          const metaobjectInput: Record<string, unknown> = { fields };
          if (needsRename) {
            metaobjectInput.handle = handle;
            metaobjectInput.redirectNewHandle = true;
          }

          const updated = await shopifyGraphql<{
            data?: {
              metaobjectUpdate?: {
                metaobject?: { id: string; handle?: string };
                userErrors?: Array<{ message: string; field?: string[] }>;
              };
            };
          }>({
            shopDomain,
            accessToken,
            query: UPDATE_METAOBJECT_MUTATION,
            variables: {
              id: current.id,
              metaobject: metaobjectInput,
            },
          });

          let errors = updated?.data?.metaobjectUpdate?.userErrors || [];

          if (errors.length > 0 && needsRename) {
            const fieldsOnly = await shopifyGraphql<{
              data?: {
                metaobjectUpdate?: {
                  userErrors?: Array<{ message: string }>;
                };
              };
            }>({
              shopDomain,
              accessToken,
              query: UPDATE_METAOBJECT_MUTATION,
              variables: {
                id: current.id,
                metaobject: { fields },
              },
            });
            errors = fieldsOnly?.data?.metaobjectUpdate?.userErrors || [];
            if (errors.length === 0) {
              const renameOnly = await shopifyGraphql<{
                data?: {
                  metaobjectUpdate?: {
                    userErrors?: Array<{ message: string }>;
                  };
                };
              }>({
                shopDomain,
                accessToken,
                query: UPDATE_METAOBJECT_MUTATION,
                variables: {
                  id: current.id,
                  metaobject: { handle, redirectNewHandle: true },
                },
              });
              errors = renameOnly?.data?.metaobjectUpdate?.userErrors || [];
            }
          }

          if (errors.length > 0) {
            console.error(
              "[playlist-metaobject-sync] update metaobject userErrors",
              metaobjectType,
              playlist.id,
              JSON.stringify(errors),
            );
          }
        }
      } catch (error) {
        console.warn("[playlist-metaobject-sync] failed to upsert playlist metaobject", metaobjectType, playlist.id, error);
      }
    }

    const stale = existing.filter((entry) => {
      const pid = entry.playlistIdFromField;
      if (pid) return !desiredPlaylistIds.has(pid);
      return true;
    });
    for (const staleEntry of stale) {
      try {
        const deleted = await shopifyGraphql<{
          data?: {
            metaobjectDelete?: { deletedId?: string | null; userErrors?: Array<{ message: string }> };
          };
        }>({
          shopDomain,
          accessToken,
          query: DELETE_METAOBJECT_MUTATION,
          variables: { id: staleEntry.id },
        });

        const errors = deleted?.data?.metaobjectDelete?.userErrors || [];
        if (errors.length > 0) {
          console.warn("[playlist-metaobject-sync] delete metaobject userErrors", metaobjectType, errors);
        }
      } catch (error) {
        console.warn("[playlist-metaobject-sync] failed to delete stale metaobject", metaobjectType, staleEntry.id, error);
      }
    }
  }
}
