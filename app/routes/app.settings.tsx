import { BlockStack, Card, Page, Text } from "@shopify/polaris";

export default function SettingsPage() {
  return (
    <Page title="Settings" subtitle="Manage your app settings and account preferences.">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Store Configuration
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Theme, widget behavior and storefront preferences will be managed here.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
