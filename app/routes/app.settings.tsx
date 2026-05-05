import { useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { Badge, BlockStack, Button, Card, InlineGrid, InlineStack, Page, Select, Tabs, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { getEmbeddedHeaders } from "../utils/embedded-auth.client";
import { normalizePlanNameFromDb } from "../utils/billingPlan";
import { requireShop } from "../utils/requireShop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);

  if (shop.shopDomain && shop.accessToken && shop.accessToken !== "dev-token") {
    try {
      const { syncBillingSubscriptionForShop } = await import("../services/billing.server");
      await syncBillingSubscriptionForShop(shop.id, shop.shopDomain, shop.accessToken);
    } catch (error) {
      console.warn("[app.settings] billing sync failed", error);
    }
  }

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
  const [billingBusy, setBillingBusy] = useState<"" | "premium_monthly" | "premium_yearly" | "refresh">("");

  const tabs = useMemo(
    () => [
      { id: "plans-pricing", content: "Plans & Pricing", panelID: "plans-pricing-panel" },
      { id: "widget-settings", content: "Widget Settings", panelID: "widget-settings-panel" },
      { id: "about", content: "About", panelID: "about-panel" },
    ],
    [],
  );

  const normalizedPlan = subscription?.status === "ACTIVE" ? normalizePlanNameFromDb(subscription.planName) : "free";
  const currentPlan = normalizedPlan === "premium_yearly" ? "Premium Yearly" : normalizedPlan === "premium_monthly" ? "Premium Monthly" : "Free";

  const startBilling = async (plan: "premium_monthly" | "premium_yearly") => {
    if (billingBusy) return;
    setBillingBusy(plan);
    try {
      const headers = await getEmbeddedHeaders();
      const response = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers,
        body: new URLSearchParams({ plan }),
      });
      const payload = (await response.json()) as { confirmationUrl?: string; error?: string };
      if (!response.ok || !payload?.confirmationUrl) {
        throw new Error(payload?.error || "Could not start billing checkout.");
      }
      if (window.top) {
        window.top.location.href = payload.confirmationUrl;
      } else {
        window.location.href = payload.confirmationUrl;
      }
    } catch (error) {
      console.error("[app.settings] start billing failed", error);
      alert(error instanceof Error ? error.message : "Could not start billing checkout.");
    } finally {
      setBillingBusy("");
    }
  };

  const refreshBilling = async () => {
    if (billingBusy) return;
    setBillingBusy("refresh");
    try {
      const headers = await getEmbeddedHeaders();
      await fetch("/api/billing/refresh", { method: "POST", headers, body: new URLSearchParams() });
      window.location.reload();
    } catch (error) {
      console.error("[app.settings] refresh billing failed", error);
      alert("Could not refresh billing status.");
    } finally {
      setBillingBusy("");
    }
  };
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
              <Button
                onClick={() => startBilling("premium_monthly")}
                disabled={billingBusy !== "" || normalizedPlan === "premium_monthly"}
              >
                {normalizedPlan === "premium_monthly" ? "Monthly active" : "Switch to Monthly"}
              </Button>
              <Button onClick={refreshBilling} loading={billingBusy === "refresh"} disabled={billingBusy !== ""}>
                Refresh status
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {selectedTab === 0 ? (
          <InlineGrid columns={2} gap="300">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Free
                  </Text>
                  {normalizedPlan === "free" ? <Badge tone="success">Current Plan</Badge> : null}
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
                <Button disabled={normalizedPlan === "free"}>
                  {normalizedPlan === "free" ? "Current Plan" : "Switch to Free Plan"}
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Premium
                  </Text>
                  {normalizedPlan === "premium_monthly" || normalizedPlan === "premium_yearly" ? (
                    <Badge tone="success">Current Plan</Badge>
                  ) : null}
                </InlineStack>
                <Text as="p" tone="subdued">
                  Best for growing stores.
                </Text>
                <Text as="p" variant="heading2xl">
                  $12
                  <Text as="span" tone="subdued">
                    {" "}
                    / month
                  </Text>
                </Text>
                <Text as="p" tone="subdued">
                  or $100 / year • 7-day trial
                </Text>
                <BlockStack gap="100">
                  <Text as="p">Unlimited video upload</Text>
                  <Text as="p">Unlimited playlists</Text>
                  <Text as="p">Unlimited videos per playlist</Text>
                  <Text as="p">No watermark</Text>
                  <Text as="p">Full analytics dashboard</Text>
                  <Text as="p">Priority support</Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Button
                    variant={normalizedPlan === "premium_monthly" ? "secondary" : "primary"}
                    disabled={billingBusy !== "" || normalizedPlan === "premium_monthly"}
                    loading={billingBusy === "premium_monthly"}
                    onClick={() => startBilling("premium_monthly")}
                  >
                    {normalizedPlan === "premium_monthly" ? "Monthly active" : "Choose Monthly"}
                  </Button>
                  <Button
                    variant={normalizedPlan === "premium_yearly" ? "secondary" : "primary"}
                    disabled={billingBusy !== "" || normalizedPlan === "premium_yearly"}
                    loading={billingBusy === "premium_yearly"}
                    onClick={() => startBilling("premium_yearly")}
                  >
                    {normalizedPlan === "premium_yearly" ? "Yearly active" : "Choose Yearly"}
                  </Button>
                </InlineStack>
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
