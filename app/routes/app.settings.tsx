import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import { Badge, BlockStack, Button, Card, InlineGrid, InlineStack, Page, Select, Tabs, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { requireShopDev } from "../utils/requireShopDev.server";

export const loader = async () => {
  const { shop } = await requireShopDev();

  const [playlistCount, videoCount, settingsCount, subscription] = await Promise.all([
    prisma.playlist.count({ where: { shopId: shop.id } }),
    prisma.video.count({ where: { shopId: shop.id } }),
    prisma.themeSettings.count({ where: { shopId: shop.id } }),
    prisma.billingSubscription.findUnique({
      where: { shopId: shop.id },
      select: { planName: true, status: true },
    }),
  ]);

  return {
    subscription,
    checklist: {
      hasMedia: videoCount > 0,
      hasPlaylists: playlistCount > 0,
      legacyThemeSettings: settingsCount > 0,
    },
  };
};

export default function SettingsPage() {
  const { subscription, checklist } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);

  const tabs = useMemo(
    () => [
      { id: "plans-pricing", content: "Plans & Pricing", panelID: "plans-pricing-panel" },
      { id: "widget-settings", content: "Widget Settings", panelID: "widget-settings-panel" },
      { id: "about", content: "About", panelID: "about-panel" },
    ],
    [],
  );

  const currentPlan = subscription?.status === "ACTIVE" ? subscription.planName || "Pro" : "Free";
  const buildDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  return (
    <Page title="Settings" subtitle="Manage your Vince Shoppable Videos app settings.">
      <BlockStack gap="400">
        <InlineStack align="end" gap="200">
          <Button>Reset to Defaults</Button>
          <Button variant="primary" disabled>
            Save Settings
          </Button>
        </InlineStack>

        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Plan
              </Text>
              <Text as="p" tone="subdued">
                {subscription?.status === "ACTIVE" ? `${currentPlan} plan is active.` : "No active subscription found."}
              </Text>
            </BlockStack>
            <InlineStack gap="200">
              <Button>Manage plan</Button>
              <Button>Refresh status</Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {selectedTab === 0 ? (
          <InlineGrid columns={["1fr", "1fr"]} gap="300">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Free
                  </Text>
                  {currentPlan.toLowerCase() === "free" ? <Badge tone="success">Current Plan</Badge> : null}
                </InlineStack>
                <Text as="p" tone="subdued">
                  Use Vinci Shoppable Videos for free.
                </Text>
                <Text as="p" variant="heading2xl">
                  $0
                  <Text as="span" tone="subdued">
                    {" "}
                    / month
                  </Text>
                </Text>
                <BlockStack gap="100">
                  <Text as="p">Unlimited video upload</Text>
                  <Text as="p">Create up to 1 playlist</Text>
                  <Text as="p">Up to 5 videos per playlist</Text>
                  <Text as="p">Vinci Shoppable Videos watermark</Text>
                  <Text as="p">No analytics</Text>
                </BlockStack>
                <Button disabled={currentPlan.toLowerCase() === "free"}>
                  {currentPlan.toLowerCase() === "free" ? "Current Plan" : "Switch to Free Plan"}
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Premium
                  </Text>
                  {currentPlan.toLowerCase() === "pro" || currentPlan.toLowerCase() === "premium" ? <Badge tone="success">Current Plan</Badge> : null}
                </InlineStack>
                <Text as="p" tone="subdued">
                  Best for growing stores.
                </Text>
                <Text as="p" variant="heading2xl">
                  $19
                  <Text as="span" tone="subdued">
                    {" "}
                    / month
                  </Text>
                </Text>
                <BlockStack gap="100">
                  <Text as="p">Unlimited video upload</Text>
                  <Text as="p">Unlimited playlists</Text>
                  <Text as="p">Unlimited videos per playlist</Text>
                  <Text as="p">No watermark</Text>
                  <Text as="p">Full analytics dashboard</Text>
                  <Text as="p">Priority support</Text>
                </BlockStack>
                <Button
                  variant={currentPlan.toLowerCase() === "pro" || currentPlan.toLowerCase() === "premium" ? "secondary" : "primary"}
                  disabled={currentPlan.toLowerCase() === "pro" || currentPlan.toLowerCase() === "premium"}
                >
                  {currentPlan.toLowerCase() === "pro" || currentPlan.toLowerCase() === "premium" ? "Current Plan" : "Change to Premium Plan"}
                </Button>
              </BlockStack>
            </Card>
          </InlineGrid>
        ) : null}

        {selectedTab === 1 ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Widget Settings
              </Text>
              <Text as="p" tone="subdued">
                Widget controls are now managed directly in the Theme Editor.
              </Text>
              <InlineStack gap="200">
                <Badge tone={checklist.hasMedia ? "success" : "attention"}>
                  {checklist.hasMedia ? "Media uploaded" : "Upload media"}
                </Badge>
                <Badge tone={checklist.hasPlaylists ? "success" : "attention"}>
                  {checklist.hasPlaylists ? "Playlist created" : "Create playlist"}
                </Badge>
                <Badge tone={checklist.legacyThemeSettings ? "info" : undefined}>
                  {checklist.legacyThemeSettings ? "Legacy settings found" : "Theme Editor active"}
                </Badge>
              </InlineStack>
            </BlockStack>
          </Card>
        ) : null}

        {selectedTab === 2 ? (
          <BlockStack gap="300">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  App Information
                </Text>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd">
                    Version
                  </Text>
                  <Badge tone="info">1.4.8</Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd">
                    Build Date
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {buildDate}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd">
                    Environment
                  </Text>
                  <Badge tone="success">Production</Badge>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Language
                </Text>
                <Text as="p" tone="subdued">
                  Choose your preferred language for the Vince Shoppable Videos app interface.
                </Text>
                <div style={{ maxWidth: 160 }}>
                  <Select
                    label="Language"
                    labelHidden
                    options={[{ label: "English", value: "en" }]}
                    value="en"
                    onChange={() => {}}
                  />
                </div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Support & Resources
                </Text>
                <BlockStack gap="100">
                  <a href="#" style={{ color: "#0c66e4", textDecoration: "underline" }}>
                    Documentation
                  </a>
                  <a href="#" style={{ color: "#0c66e4", textDecoration: "underline" }}>
                    Support
                  </a>
                  <a href="#" style={{ color: "#0c66e4", textDecoration: "underline" }}>
                    Email Support
                  </a>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        ) : null}
      </BlockStack>
    </Page>
  );
}
