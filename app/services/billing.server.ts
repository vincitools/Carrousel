import prisma from "../db.server";
import { apiVersion } from "../shopify.server";

export type BillingPlanKey = "premium_monthly" | "premium_yearly";

type ActiveSubscription = {
  id: string;
  name: string;
  status: string;
  currentPeriodEnd: string | null;
  interval: "EVERY_30_DAYS" | "ANNUAL" | null;
};

const PLAN_CONFIG: Record<
  BillingPlanKey,
  { name: string; amount: number; interval: "EVERY_30_DAYS" | "ANNUAL"; planNameForDb: string }
> = {
  premium_monthly: {
    name: "Vinci Premium Monthly",
    amount: 12,
    interval: "EVERY_30_DAYS",
    planNameForDb: "Premium Monthly",
  },
  premium_yearly: {
    name: "Vinci Premium Yearly",
    amount: 100,
    interval: "ANNUAL",
    planNameForDb: "Premium Yearly",
  },
};

function resolveAppUrl() {
  const host = process.env.HOST || process.env.RENDER_EXTERNAL_HOSTNAME || "";
  if (host) return host.startsWith("http") ? host : `https://${host}`;
  return process.env.SHOPIFY_APP_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "";
}

function adminGraphqlUrl(shopDomain: string) {
  const version = typeof apiVersion === "string" ? apiVersion : String(apiVersion);
  return `https://${shopDomain}/admin/api/${version}/graphql.json`;
}

async function shopifyGraphql<T>({
  shopDomain,
  accessToken,
  query,
  variables,
}: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(adminGraphqlUrl(shopDomain), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as T & { errors?: Array<{ message: string }> };
  if (!response.ok || payload?.errors?.length) {
    throw new Error(payload?.errors?.map((error) => error.message).join("; ") || "Shopify GraphQL request failed");
  }
  return payload;
}

const CURRENT_SUBSCRIPTIONS_QUERY = `
  query CurrentSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
              }
            }
          }
        }
      }
    }
  }
`;

const APP_SUBSCRIPTION_CREATE_MUTATION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $trialDays: Int
    $replacementBehavior: AppSubscriptionReplacementBehavior
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      trialDays: $trialDays
      replacementBehavior: $replacementBehavior
    ) {
      confirmationUrl
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function getActiveSubscriptions(shopDomain: string, accessToken: string): Promise<ActiveSubscription[]> {
  const result = await shopifyGraphql<{
    data?: {
      currentAppInstallation?: {
        activeSubscriptions?: Array<{
          id: string;
          name: string;
          status: string;
          currentPeriodEnd?: string | null;
          lineItems?: Array<{
            plan?: {
              pricingDetails?: {
                __typename?: string;
                interval?: "EVERY_30_DAYS" | "ANNUAL";
              } | null;
            } | null;
          }>;
        }>;
      } | null;
    };
  }>({
    shopDomain,
    accessToken,
    query: CURRENT_SUBSCRIPTIONS_QUERY,
  });

  const subs = result?.data?.currentAppInstallation?.activeSubscriptions || [];
  return subs.map((sub) => {
    const pricingDetails = sub.lineItems?.[0]?.plan?.pricingDetails || null;
    const interval = pricingDetails?.__typename === "AppRecurringPricing" ? pricingDetails.interval || null : null;
    return {
      id: sub.id,
      name: sub.name,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd || null,
      interval,
    };
  });
}

export async function syncBillingSubscriptionForShop(shopId: string, shopDomain: string, accessToken: string) {
  const activeSubs = await getActiveSubscriptions(shopDomain, accessToken);
  const active = activeSubs.find((sub) => String(sub.status || "").toUpperCase() === "ACTIVE") || activeSubs[0] || null;

  if (!active) {
    await prisma.billingSubscription.deleteMany({ where: { shopId } });
    return null;
  }

  const planName =
    active.interval === "ANNUAL"
      ? "Premium Yearly"
      : active.interval === "EVERY_30_DAYS"
        ? "Premium Monthly"
        : active.name || "Premium";

  const currentPeriodEnd = active.currentPeriodEnd ? new Date(active.currentPeriodEnd) : new Date();
  const status = String(active.status || "ACTIVE").toUpperCase() as "ACTIVE" | "PAUSED" | "CANCELLED";

  const record = await prisma.billingSubscription.upsert({
    where: { shopId },
    create: {
      shopId,
      planName,
      status,
      shopifyChargeId: active.id,
      currentPeriodEnd,
    },
    update: {
      planName,
      status,
      shopifyChargeId: active.id,
      currentPeriodEnd,
    },
  });

  return record;
}

export async function createSubscriptionConfirmationUrl({
  shopDomain,
  accessToken,
  planKey,
}: {
  shopDomain: string;
  accessToken: string;
  planKey: BillingPlanKey;
}) {
  const plan = PLAN_CONFIG[planKey];
  if (!plan) {
    throw new Error("Invalid billing plan.");
  }

  const appUrl = resolveAppUrl();
  if (!appUrl) {
    throw new Error("App URL is not configured.");
  }

  const returnUrl = `${appUrl}/app/settings?billing=return`;

  const result = await shopifyGraphql<{
    data?: {
      appSubscriptionCreate?: {
        confirmationUrl?: string | null;
        userErrors?: Array<{ message: string }>;
      };
    };
  }>({
    shopDomain,
    accessToken,
    query: APP_SUBSCRIPTION_CREATE_MUTATION,
    variables: {
      name: plan.name,
      trialDays: 7,
      replacementBehavior: "APPLY_IMMEDIATELY",
      returnUrl,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              interval: plan.interval,
              price: { amount: plan.amount, currencyCode: "USD" },
            },
          },
        },
      ],
    },
  });

  const errors = result?.data?.appSubscriptionCreate?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }

  const confirmationUrl = result?.data?.appSubscriptionCreate?.confirmationUrl || "";
  if (!confirmationUrl) {
    throw new Error("Missing confirmation URL from Shopify.");
  }
  return confirmationUrl;
}

export function normalizePlanNameFromDb(planName: string | null | undefined) {
  const value = String(planName || "").toLowerCase();
  if (value.includes("year")) return "premium_yearly";
  if (value.includes("month") || value.includes("premium") || value.includes("pro")) return "premium_monthly";
  return "free";
}
