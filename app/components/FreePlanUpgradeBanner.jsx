import { useState } from "react";
import { Button, Text } from "@shopify/polaris";

const BANNER_BODY =
  "You are currently using the Free plan. Upgrade to the Pro plan to receive additional features and unlimited impressions.";

export function FreePlanUpgradeBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#b6e0fe",
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 14px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
          <span
            aria-hidden
            style={{
              alignItems: "center",
              background: "#2c6ecb",
              borderRadius: "50%",
              color: "#fff",
              display: "inline-flex",
              fontSize: "12px",
              fontWeight: 700,
              height: "18px",
              justifyContent: "center",
              width: "18px",
            }}
          >
            i
          </span>
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            Free plan
          </Text>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          style={{
            background: "transparent",
            border: "none",
            color: "#4a4a4a",
            cursor: "pointer",
            fontSize: "18px",
            lineHeight: 1,
            padding: "2px 6px",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <Text as="p" variant="bodyMd">
          {BANNER_BODY}
        </Text>
        <div style={{ marginTop: "12px" }}>
          <Button url="/app/settings">Upgrade</Button>
        </div>
      </div>
    </div>
  );
}
