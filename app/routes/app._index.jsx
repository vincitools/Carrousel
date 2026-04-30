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

export const loader = async () => {
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
};

export default function Index() {
  const { onboarding } = useLoaderData();

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
      title: "Install Vinci Shoppable Videos",
      description:
        "Complete the installation process and set up your Vinci Shoppable Videos account to start creating engaging content.",
      done: onboarding.appInstalled,
      ctaLabel: "Open Settings",
      href: "/app/settings",
    },
    {
      title: "Add Videos and Tag Products",
      description: "Upload media and connect products to make your content shoppable.",
      done: onboarding.contentAdded,
      ctaLabel: "Add Content",
      href: "/app/library",
    },
    {
      title: "Create Your First Playlist",
      description: "Group your content into playlists for more organized storefront experiences.",
      done: onboarding.playlistCreated,
      ctaLabel: "Create Playlist",
      href: "/app/playlists",
    },
    {
      title: "Show Playlists on Store Pages",
      description: "Complete setup in the Theme Editor so playlists appear on your store pages.",
      done: onboarding.playlistEmbedded,
      ctaLabel: "Open Settings",
      href: "/app/settings",
    },
  ];

  return (
    <Page
      title="Dashboard"
      subtitle="Welcome to Vinci Shoppable Videos"
      primaryAction={{ content: "Open Products", url: "shopify://admin/products", target: "_top" }}
      secondaryActions={[{ content: "Open Customers", url: "shopify://admin/customers", target: "_top" }]}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingLg">
                Setup Guide
              </Text>
              <Button onClick={() => setSetupExpanded((v) => !v)}>
                {setupExpanded ? "Collapse" : "Expand"}
              </Button>
            </InlineStack>

            <Text as="p" variant="bodyMd" tone="subdued">
              Complete setup steps to maximize your store&apos;s potential.
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
                              {step.done ? <Badge tone="success">Done</Badge> : <Badge tone="attention">Pending</Badge>}
                            </Box>
                            <Text as="h3" variant="headingMd">
                              {step.title}
                            </Text>
                          </InlineStack>
                          <Button variant="plain" onClick={() => setOpenedStepIndex(index)}>
                            {isOpen ? "Hide" : "Show"}
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
                                  {step.done ? "Open" : step.ctaLabel}
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

        {progress < 100 ? (
          <Banner
            tone="info"
            title="Finish setup to unlock full analytics"
            action={{ content: "Go to Settings", url: "/app/settings" }}
          >
            <p>Configure your Theme Editor setup and playlists to start tracking engagement and conversions.</p>
          </Banner>
        ) : null}
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
