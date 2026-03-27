import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { AppProvider, Page, Card, FormLayout, TextField, Button, Text, BlockStack } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider i18n={{}}>
      <Page narrowWidth>
        <div style={{ marginTop: "10vh" }}>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h1">
                Log in
              </Text>
              <Form method="post">
                <FormLayout>
                  <TextField
                    label="Shop domain"
                    name="shop"
                    placeholder="example.myshopify.com"
                    helpText="Enter your .myshopify.com domain"
                    value={shop}
                    onChange={setShop}
                    autoComplete="on"
                    error={errors.shop}
                  />
                  <Button submit variant="primary" fullWidth>
                    Log in
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
