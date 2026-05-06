import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { AppProvider, Page, Card, FormLayout, Button, Text, BlockStack, Banner } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") || "").trim();
  const loginResult = await login(request);
  if (loginResult instanceof Response) {
    return loginResult;
  }
  const errors = loginErrorMessage(loginResult);
  return { errors, shop };
};

export const action = async ({ request }) => {
  const loginResult = await login(request);
  if (loginResult instanceof Response) {
    return loginResult;
  }
  const errors = loginErrorMessage(loginResult);
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const { errors } = actionData || loaderData;
  const shop = loaderData?.shop || "";

  return (
    <AppProvider i18n={{}}>
      <Page narrowWidth>
        <div style={{ marginTop: "10vh" }}>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h1">
                Log in
              </Text>
              <Banner tone="info">
                Install and open this app from Shopify Admin. Manual shop-domain entry is not required.
              </Banner>
              <Form method="post">
                <FormLayout>
                  <input type="hidden" name="shop" value={shop} />
                  {errors.shop ? <Banner tone="critical">{errors.shop}</Banner> : null}
                  <Button submit variant="primary" fullWidth>
                    Continue with Shopify
                  </Button>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </div>
      </Page>
    </AppProvider>
  );
}
