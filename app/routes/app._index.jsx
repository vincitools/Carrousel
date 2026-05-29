import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { FreePlanUpgradeBanner } from "../components/FreePlanUpgradeBanner";
import { requireShopDev } from "../utils/requireShopDev.server";
import { isCarrouselBlockInstalledInMainTheme } from "../utils/themeCarrouselInstall.server";
import { setupThemePlaylistPickerForShop } from "../services/playlistMetaobjectSync.server";
import { normalizePlanNameFromDb } from "../utils/billingPlan";
import { getEmbeddedHeaders } from "../utils/embedded-auth.client";
import prisma from "../db.server";
import { useI18n } from "../utils/i18n";

const DEFAULT_THEME_PICKER = {
  definitionReady: false,
  entryCount: 0,
  playlistCount: 0,
  message: "",
  types: [],
};

async function resolveIsFreePlan(shopId, shopDomain, accessToken) {
  if (accessToken === "dev-token") {
    return false;
  }

  if (shopDomain && accessToken) {
    try {
      const { syncBillingSubscriptionForShop } = await import("../services/billing.server");
      await syncBillingSubscriptionForShop(shopId, shopDomain, accessToken);
    } catch (error) {
      console.warn("[app._index] billing sync failed", error);
    }
  }

  const subscription = await prisma.billingSubscription.findUnique({
    where: { shopId },
    select: { planName: true, status: true },
  });

  const normalizedPlan =
    subscription?.status === "ACTIVE" ? normalizePlanNameFromDb(subscription.planName) : "free";

  return normalizedPlan === "free";
}

export const loader = async ({ request }) => {
  let themeEditorUrl = "";
  let themePicker = DEFAULT_THEME_PICKER;

  try {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session?.shop || "";
    if (shopDomain) {
      themeEditorUrl = `https://${shopDomain}/admin/themes/current/editor?context=apps`;
    }

    const shopRow = shopDomain
      ? await prisma.shop.upsert({
          where: { shopDomain },
          update: { accessToken: session.accessToken, uninstalledAt: null },
          create: { shopDomain, accessToken: session.accessToken },
          select: { id: true },
        })
      : null;

    const shopId = shopRow?.id;
    if (!shopId) {
      throw new Error("Shop not found");
    }

    if (session.accessToken) {
      themePicker = await setupThemePlaylistPickerForShop(shopId, {
        shopDomain,
        accessToken: session.accessToken,
      });
    }

    const [videoCount, taggedVideoCount, playlistCount, playlistEmbedded, isFreePlan] = await Promise.all([
      prisma.video.count({ where: { shopId } }),
      prisma.video.count({
        where: {
          shopId,
          productTags: {
            some: {},
          },
        },
      }),
      prisma.playlist.count({ where: { shopId } }),
      isCarrouselBlockInstalledInMainTheme(admin),
      resolveIsFreePlan(shopId, shopDomain, session.accessToken),
    ]);

    const playlistPickerReady = themePicker.definitionReady && themePicker.entryCount > 0;

    return {
      themeEditorUrl,
      isFreePlan,
      themePicker,
      onboarding: {
        appInstalled: true,
        contentAdded: videoCount > 0 && taggedVideoCount > 0,
        playlistCreated: playlistCount > 0,
        playlistEmbedded,
        playlistPickerReady,
      },
    };
  } catch (error) {
    console.warn("[app._index] loader fallback due to error", error);

    try {
      const { shop } = await requireShopDev();
      const [videoCount, taggedVideoCount, playlistCount, themeSettingsCount] = await Promise.all([
        prisma.video.count({ where: { shopId: shop.id } }),
        prisma.video.count({
          where: {
            shopId: shop.id,
            productTags: { some: {} },
          },
        }),
        prisma.playlist.count({ where: { shopId: shop.id } }),
        prisma.themeSettings.count({ where: { shopId: shop.id } }),
      ]);

      if (shop.shopDomain) {
        themeEditorUrl = `https://${shop.shopDomain}/admin/themes/current/editor?context=apps`;
      }

      const isFreePlan = await resolveIsFreePlan(shop.id, shop.shopDomain, shop.accessToken);

      let themePickerFallback = DEFAULT_THEME_PICKER;
      if (shop.accessToken && shop.accessToken !== "dev-token") {
        themePickerFallback = await setupThemePlaylistPickerForShop(shop.id, {
          shopDomain: shop.shopDomain,
          accessToken: shop.accessToken,
        });
      }

      return {
        themeEditorUrl,
        isFreePlan,
        themePicker: themePickerFallback,
        onboarding: {
          appInstalled: true,
          contentAdded: videoCount > 0 && taggedVideoCount > 0,
          playlistCreated: playlistCount > 0,
          playlistEmbedded: themeSettingsCount > 0,
          playlistPickerReady:
            themePickerFallback.definitionReady && themePickerFallback.entryCount > 0,
        },
      };
    } catch {
      return {
        themeEditorUrl,
        isFreePlan: true,
        themePicker: DEFAULT_THEME_PICKER,
        onboarding: {
          appInstalled: true,
          contentAdded: false,
          playlistCreated: false,
          playlistEmbedded: false,
          playlistPickerReady: false,
        },
      };
    }
  }
};

export default function Index() {
  const { onboarding, themeEditorUrl, isFreePlan, themePicker: initialThemePicker } = useLoaderData();
  const revalidator = useRevalidator();
  const { t } = useI18n();

  const [themePicker, setThemePicker] = useState(initialThemePicker || DEFAULT_THEME_PICKER);
  const [syncingThemePicker, setSyncingThemePicker] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const stepsDone = [
    onboarding.appInstalled,
    onboarding.contentAdded,
    onboarding.playlistCreated,
    onboarding.playlistEmbedded,
    onboarding.playlistPickerReady,
  ];

  const completed = stepsDone.filter(Boolean).length;
  const progress = Math.round((completed / stepsDone.length) * 100);

  const [setupExpanded, setSetupExpanded] = useState(true);
  const [openedStepIndex, setOpenedStepIndex] = useState(
    onboarding.playlistPickerReady ? 0 : Math.max(0, stepsDone.findIndex((done) => !done)),
  );

  const syncThemePicker = async () => {
    if (syncingThemePicker) return;
    setSyncingThemePicker(true);
    setSyncMessage("");
    try {
      const headers = await getEmbeddedHeaders();
      const response = await fetch("/api/playlists/setup-theme", {
        method: "POST",
        headers,
      });
      const payload = await response.json();
      if (payload) {
        setThemePicker({
          definitionReady: Boolean(payload.definitionReady),
          entryCount: Number(payload.entryCount) || 0,
          playlistCount: Number(payload.playlistCount) || 0,
          message: payload.message || "",
          types: Array.isArray(payload.types) ? payload.types : [],
        });
      }
      if (payload?.definitionReady && Number(payload.entryCount) > 0) {
        revalidator.revalidate();
      } else {
        setSyncMessage(
          payload?.message || payload?.error || "Theme Editor playlist picker is not ready yet.",
        );
      }
    } catch (error) {
      console.error("[app._index] theme picker sync failed", error);
      setSyncMessage("Could not sync playlists for the Theme Editor.");
    } finally {
      setSyncingThemePicker(false);
    }
  };

  const stepItems = [
    {
      title: t("Install Vinci Shoppable Videos"),
      description: t(
        "Complete the installation process and set up your Vinci Shoppable Videos account to start creating engaging content.",
      ),
      done: onboarding.appInstalled,
      ctaLabel: t("Open Settings"),
      href: "/app/settings",
    },
    {
      title: t("Add Videos and Tag Products"),
      description: t("Upload media and connect products to make your content shoppable."),
      done: onboarding.contentAdded,
      ctaLabel: t("Add Content"),
      href: "/app/library",
    },
    {
      title: t("Create Your First Playlist"),
      description: t("Group your content into playlists for more organized storefront experiences."),
      done: onboarding.playlistCreated,
      ctaLabel: t("Create Playlist"),
      href: "/app/playlists",
    },
    {
      title: t("Add Carousel to Your Theme"),
      description: t("Add the Vinci carousel app block in the Theme Editor on the pages where you want videos to appear."),
      done: onboarding.playlistEmbedded,
      ctaLabel: t("Open Theme Editor"),
      href: themeEditorUrl || "/app/playlists",
      external: Boolean(themeEditorUrl),
    },
    {
      title: t("Select a Playlist in Theme Editor"),
      description:
        themePicker.message ||
        t("Sync your playlists, then open the Theme Editor and choose a playlist in the carousel block settings."),
      done: onboarding.playlistPickerReady,
      ctaLabel: t("Open Theme Editor"),
      href: themeEditorUrl || "/app/playlists",
      external: Boolean(themeEditorUrl),
      isPlaylistPickerStep: true,
    },
  ];

  return (
    <Page
      title="Dashboard"
      subtitle={t("Welcome to Vinci Shoppable Videos")}
      primaryAction={{ content: t("Open Products"), url: "shopify://admin/products", target: "_top" }}
      secondaryActions={[{ content: t("Open Customers"), url: "shopify://admin/customers", target: "_top" }]}
    >
      <BlockStack gap="400">
        {isFreePlan ? <FreePlanUpgradeBanner /> : null}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingLg">
                {t("Setup Guide")}
              </Text>
              <Button onClick={() => setSetupExpanded((v) => !v)}>
                {setupExpanded ? t("Collapse") : t("Expand")}
              </Button>
            </InlineStack>

            <Text as="p" variant="bodyMd" tone="subdued">
              {t("Complete setup steps to maximize your store's potential.")}
            </Text>

            <InlineGrid columns={["2fr", "5fr"]} gap="300">
              <Text as="span" variant="bodyMd">
                {completed} of {stepsDone.length} steps completed
              </Text>
              <ProgressBar progress={progress} size="small" />
            </InlineGrid>

            {setupExpanded ? (
              <BlockStack gap="200">
                {stepItems.map((step, index) => {
                  const isOpen = openedStepIndex === index;
                  return (
                    <Card key={step.title} background={index === 0 ? "bg-surface-secondary" : "bg-surface"}>
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Box>
                              {step.done ? <Badge tone="success">{t("Done")}</Badge> : <Badge tone="attention">{t("Pending")}</Badge>}
                            </Box>
                            <Text as="h3" variant="headingMd">
                              {step.title}
                            </Text>
                          </InlineStack>
                          <Button variant="plain" onClick={() => setOpenedStepIndex(index)}>
                            {isOpen ? t("Hide") : t("Show")}
                          </Button>
                        </InlineStack>

                        {isOpen ? (
                          <BlockStack gap="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              {step.description}
                            </Text>

                            {step.isPlaylistPickerStep ? (
                              <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Playlists in app: {themePicker.playlistCount} · Synced for picker:{" "}
                                  {themePicker.entryCount}
                                </Text>
                                {syncMessage ? (
                                  <Banner tone="warning">{syncMessage}</Banner>
                                ) : null}
                                <InlineStack gap="200">
                                  <Button loading={syncingThemePicker} onClick={syncThemePicker}>
                                    Sync for Theme Editor
                                  </Button>
                                  {themeEditorUrl ? (
                                    <Button
                                      url={themeEditorUrl}
                                      external
                                      target="_blank"
                                      variant={step.done ? "secondary" : "primary"}
                                    >
                                      {step.done ? t("Open") : t(step.ctaLabel)}
                                    </Button>
                                  ) : null}
                                </InlineStack>
                              </BlockStack>
                            ) : index === 0 ? null : (
                              <InlineStack>
                                <Button
                                  url={step.href}
                                  variant={step.done ? "secondary" : "primary"}
                                  external={step.external}
                                  target={step.external ? "_blank" : undefined}
                                >
                                  {step.done ? t("Open") : t(step.ctaLabel)}
                                </Button>
                              </InlineStack>
                            )}
                          </BlockStack>
                        ) : null}
                      </BlockStack>
                    </Card>
                  );
                })}
              </BlockStack>
            ) : null}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
