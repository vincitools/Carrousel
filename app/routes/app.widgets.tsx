import { BlockStack, Card, Page, Text } from "@shopify/polaris";

export default function WidgetsPage() {
  return (
    <Page title="Widgets" subtitle="Configure where your playlists are shown in your storefront.">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Widget Placement
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Choose pages and templates where carousels should render.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
