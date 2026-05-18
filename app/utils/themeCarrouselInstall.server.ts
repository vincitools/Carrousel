import { PLAYLIST_APP_CLIENT_ID } from "../constants/playlistMetaobject";

/** Substrings that appear when the carousel app block is present in theme JSON. */
const CARROSEL_BLOCK_MARKERS = [
  "carrousel-block",
  "/blocks/carrousel-block/",
  `apps/${PLAYLIST_APP_CLIENT_ID}/blocks/`,
] as const;

export function themeContentHasCarrouselBlock(content: string | undefined) {
  if (!content) return false;
  const normalized = content.toLowerCase();
  return CARROSEL_BLOCK_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()));
}

/** Theme JSON files where app blocks are commonly saved (templates + section groups + settings). */
const THEME_FILES_TO_SCAN = [
  "config/settings_data.json",
  "templates/index.json",
  "templates/product.json",
  "templates/collection.json",
  "templates/page.json",
  "templates/blog.json",
  "templates/article.json",
  "templates/list-collections.json",
  "templates/search.json",
  "templates/cart.json",
  "sections/header-group.json",
  "sections/footer-group.json",
] as const;

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/**
 * Returns true when the published main theme includes the Vinci carousel app block.
 */
export async function isCarrouselBlockInstalledInMainTheme(admin: AdminGraphql): Promise<boolean> {
  const themesResponse = await admin.graphql(`
    query CarrouselThemeCheck {
      themes(first: 20) {
        nodes {
          id
          role
        }
      }
    }
  `);

  const themesPayload = (await themesResponse.json()) as {
    data?: { themes?: { nodes?: Array<{ id: string; role: string }> } };
  };
  const mainTheme = themesPayload?.data?.themes?.nodes?.find((theme) => theme.role === "MAIN");
  if (!mainTheme?.id) return false;

  const filesResponse = await admin.graphql(
    `
      query CarrouselThemeFiles($id: ID!, $filenames: [String!]) {
        theme(id: $id) {
          files(first: ${THEME_FILES_TO_SCAN.length}, filenames: $filenames) {
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
        filenames: [...THEME_FILES_TO_SCAN],
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

  const nodes = filesPayload?.data?.theme?.files?.nodes || [];
  return nodes.some((node) => themeContentHasCarrouselBlock(node?.body?.content));
}
