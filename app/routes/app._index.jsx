import { useState } from "react";
import { useLoaderData } from "react-router";
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
import { requireShopDev } from "../utils/requireShopDev.server";
import prisma from "../db.server";
import { useI18n } from "../utils/i18n.client";

export const loader = async () => {
  try {
    const { shop } = await requireShopDev();

    const [videoCount, taggedVideoCount, playlistCount, themeSettingsCount] = await Promise.all([
      prisma.video.count({ where: { shopId: shop.id } }),
      prisma.video.count({
        where: {
          shopId: shop.id,
          productTags: {
            some: {},
          },
        },
      }),
      prisma.playlist.count({ where: { shopId: shop.id } }),
      prisma.themeSettings.count({ where: { shopId: shop.id } }),
    ]);

    return {
      onboarding: {
        appInstalled: true,
        contentAdded: videoCount > 0 && taggedVideoCount > 0,
        playlistCreated: playlistCount > 0,
        playlistEmbedded: themeSettingsCount > 0,
      },
    };
  } catch (error) {
    console.warn("[app._index] loader fallback due to error", error);
    return {
      onboarding: {
        appInstalled: true,
        contentAdded: false,
        playlistCreated: false,
        playlistEmbedded: false,
      },
    };
  }
};

export default function Index() {
  const { onboarding } = useLoaderData();
  const { t } = useI18n();

  const stepsDone = [
    onboarding.appInstalled,
    onboarding.contentAdded,
    onboarding.playlistCreated,
    onboarding.playlistEmbedded,
  ];

  const completed = stepsDone.filter(Boolean).length;
  const progress = Math.round((completed / stepsDone.length) * 100);

  const [setupExpanded, setSetupExpanded] = useState(true);
  const [openedStepIndex, setOpenedStepIndex] = useState(0);
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
      title: t("Show Playlists on Store Pages"),
      description: t("Complete setup in the Theme Editor so playlists appear on your store pages."),
      done: onboarding.playlistEmbedded,
      ctaLabel: t("Open Settings"),
      href: "/app/settings",
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
                            <InlineStack>
                              {index === 0 ? null : (
                                <Button url={step.href} variant={step.done ? "secondary" : "primary"}>
                                  {step.done ? t("Open") : t(step.ctaLabel)}
                                </Button>
                              )}
                            </InlineStack>
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
