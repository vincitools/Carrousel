import prisma from "../db.server";

const PLAYLIST_METAOBJECT_TYPE = "vinci_playlist";

const GET_DEFINITION_QUERY = `
  query GetPlaylistMetaobjectDefinition($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
    }
  }
`;

const CREATE_DEFINITION_MUTATION = `
  mutation CreatePlaylistMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
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
  const response = await fetch(`https://${shopDomain}/admin/api/2025-07/graphql.json`, {
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

async function ensureMetaobjectDefinition(shopDomain: string, accessToken: string) {
  const existing = await shopifyGraphql<{
    data?: { metaobjectDefinitionByType?: { id: string } | null };
  }>({
    shopDomain,
    accessToken,
    query: GET_DEFINITION_QUERY,
    variables: { type: PLAYLIST_METAOBJECT_TYPE },
  });

  if (existing?.data?.metaobjectDefinitionByType?.id) {
    return;
  }

  const created = await shopifyGraphql<{
    data?: {
      metaobjectDefinitionCreate?: {
        metaobjectDefinition?: { id: string };
        userErrors?: Array<{ message: string }>;
      };
    };
  }>({
    shopDomain,
    accessToken,
    query: CREATE_DEFINITION_MUTATION,
    variables: {
      definition: {
        name: "Vinci Playlist",
        type: PLAYLIST_METAOBJECT_TYPE,
        access: { storefront: "PUBLIC_READ" },
        fieldDefinitions: [
          {
            name: "Playlist ID",
            key: "playlist_id",
            type: "single_line_text_field",
            required: true,
          },
          {
            name: "Playlist Name",
            key: "playlist_name",
            type: "single_line_text_field",
            required: true,
          },
        ],
      },
    },
  });

  const errors = created?.data?.metaobjectDefinitionCreate?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("; "));
  }
}

async function listAllPlaylistMetaobjects(shopDomain: string, accessToken: string) {
  let hasNextPage = true;
  let cursor: string | null = null;
  const nodes: Array<{ id: string; handle: string }> = [];

  while (hasNextPage) {
    const result = await shopifyGraphql<{
      data?: {
        metaobjects?: {
          nodes?: Array<{ id: string; handle: string }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    }>({
      shopDomain,
      accessToken,
      query: LIST_METAOBJECTS_QUERY,
      variables: {
        type: PLAYLIST_METAOBJECT_TYPE,
        first: 100,
        after: cursor,
      },
    });

    const pageNodes = result?.data?.metaobjects?.nodes || [];
    nodes.push(...pageNodes);

    hasNextPage = Boolean(result?.data?.metaobjects?.pageInfo?.hasNextPage);
    cursor = result?.data?.metaobjects?.pageInfo?.endCursor || null;
  }

  return nodes;
}

export async function syncPlaylistMetaobjectsForShop(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopDomain: true, accessToken: true },
  });

  if (!shop?.shopDomain || !shop?.accessToken || shop.accessToken === "dev-token") {
    return;
  }

  const playlists = await prisma.playlist.findMany({
    where: { shopId },
    select: { id: true, name: true },
  });

  try {
    await ensureMetaobjectDefinition(shop.shopDomain, shop.accessToken);
  } catch (error) {
    console.warn("[playlist-metaobject-sync] failed to ensure definition", error);
    return;
  }

  let existing: Array<{ id: string; handle: string }> = [];
  try {
    existing = await listAllPlaylistMetaobjects(shop.shopDomain, shop.accessToken);
  } catch (error) {
    console.warn("[playlist-metaobject-sync] failed to list metaobjects", error);
    return;
  }

  const existingByHandle = new Map(existing.map((entry) => [entry.handle, entry]));
  const desiredHandles = new Set(playlists.map((playlist) => playlist.id));

  for (const playlist of playlists) {
    const current = existingByHandle.get(playlist.id);
    const fields = [
      { key: "playlist_id", value: playlist.id },
      { key: "playlist_name", value: playlist.name },
    ];

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
          shopDomain: shop.shopDomain,
          accessToken: shop.accessToken,
          query: CREATE_METAOBJECT_MUTATION,
          variables: {
            metaobject: {
              type: PLAYLIST_METAOBJECT_TYPE,
              handle: playlist.id,
              fields,
            },
          },
        });

        const errors = created?.data?.metaobjectCreate?.userErrors || [];
        if (errors.length > 0) {
          console.warn("[playlist-metaobject-sync] create metaobject userErrors", errors);
        }
      } else {
        const updated = await shopifyGraphql<{
          data?: {
            metaobjectUpdate?: {
              metaobject?: { id: string };
              userErrors?: Array<{ message: string }>;
            };
          };
        }>({
          shopDomain: shop.shopDomain,
          accessToken: shop.accessToken,
          query: UPDATE_METAOBJECT_MUTATION,
          variables: {
            id: current.id,
            metaobject: { fields },
          },
        });

        const errors = updated?.data?.metaobjectUpdate?.userErrors || [];
        if (errors.length > 0) {
          console.warn("[playlist-metaobject-sync] update metaobject userErrors", errors);
        }
      }
    } catch (error) {
      console.warn("[playlist-metaobject-sync] failed to upsert playlist metaobject", playlist.id, error);
    }
  }

  const stale = existing.filter((entry) => !desiredHandles.has(entry.handle));
  for (const staleEntry of stale) {
    try {
      const deleted = await shopifyGraphql<{
        data?: {
          metaobjectDelete?: { deletedId?: string | null; userErrors?: Array<{ message: string }> };
        };
      }>({
        shopDomain: shop.shopDomain,
        accessToken: shop.accessToken,
        query: DELETE_METAOBJECT_MUTATION,
        variables: { id: staleEntry.id },
      });

      const errors = deleted?.data?.metaobjectDelete?.userErrors || [];
      if (errors.length > 0) {
        console.warn("[playlist-metaobject-sync] delete metaobject userErrors", errors);
      }
    } catch (error) {
      console.warn("[playlist-metaobject-sync] failed to delete stale metaobject", staleEntry.id, error);
    }
  }
}
