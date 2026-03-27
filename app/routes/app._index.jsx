import { useState } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
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
      title: "Install Reelio App",
      description:
        "Complete the installation process and set up your Reelio account to start creating engaging content.",
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
      title: "Show Playlists on Pages",
      description: "Complete your widget setup so playlists appear on your store pages.",
      done: onboarding.playlistEmbedded,
      ctaLabel: "Open Widgets",
      href: "/app/widgets",
    },
  ];

  return (
    <div>
      <div style={{ margin: "0 auto", maxWidth: "980px", padding: "8px 12px 32px" }}>
        <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h1
              style={{
                color: "#1f2937",
                fontSize: "32px",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              Dashboard
            </h1>
            <p style={{ color: "#4b5563", fontSize: "15px", margin: "8px 0 0" }}>Welcome to Reelio</p>
          </div>

          <div style={{ alignItems: "center", display: "flex", gap: "10px", paddingTop: "4px" }}>
            <ActionButton href="#" variant="primary">
              Book Free Setup Call
            </ActionButton>
            <ActionButton href="#" variant="secondary">
              Watch Setup Video
            </ActionButton>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #d9dce1",
            borderRadius: "14px",
            marginTop: "20px",
            overflow: "hidden",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "16px" }}>
            <div>
              <div
                style={{
                  color: "#303030",
                  fontSize: "24px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Setup Guide
              </div>
              <div style={{ color: "#4b5563", fontSize: "15px", marginTop: "10px" }}>
                Complete setup steps to maximize your store&apos;s potential
              </div>
              <div style={{ alignItems: "center", display: "flex", gap: "8px", marginTop: "12px" }}>
                <span style={{ color: "#1f2937", fontSize: "15px" }}>
                  {completed} of {stepsDone.length} steps completed
                </span>
                <div style={{ background: "#d1d5db", borderRadius: "999px", height: "9px", overflow: "hidden", width: "100px" }}>
                  <div style={{ background: "#23262f", height: "100%", width: `${progress}%` }} />
                </div>
              </div>
            </div>

            <button
              type="button"
              aria-label="Toggle setup guide"
              onClick={() => setSetupExpanded((v) => !v)}
              style={{ background: "transparent", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "20px" }}
            >
              {setupExpanded ? "⌃" : "⌄"}
            </button>
          </div>

          {setupExpanded && (
            <div style={{ padding: "0 8px 10px" }}>
              {stepItems.map((step, index) => {
                const isOpen = openedStepIndex === index;

                return (
                  <div
                    key={step.title}
                    style={{
                      alignItems: "flex-start",
                      background: index === 0 ? "#f3f4f6" : "transparent",
                      borderRadius: "10px",
                      display: "flex",
                      gap: "12px",
                      marginBottom: "8px",
                      padding: "12px 14px",
                    }}
                  >
                    <StepDot done={step.done} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => setOpenedStepIndex(index)}
                        style={{
                          alignItems: "center",
                          background: "transparent",
                          border: "none",
                          color: "#303030",
                          cursor: "pointer",
                          display: "flex",
                          fontSize: "20px",
                          fontWeight: 700,
                          gap: "10px",
                          justifyContent: "space-between",
                          lineHeight: 1.15,
                          padding: 0,
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <span>{step.title}</span>
                        <span style={{ color: "#6b7280", fontSize: "16px" }}>{isOpen ? "⌃" : "⌄"}</span>
                      </button>

                      {isOpen && (
                        <>
                          <div style={{ color: "#4b5563", fontSize: "14px", marginTop: "6px" }}>{step.description}</div>
                          <a
                            href={step.href}
                            style={{
                              background: step.done ? "#f3f4f6" : "#23262f",
                              border: step.done ? "1px solid #d1d5db" : "1px solid #23262f",
                              borderRadius: "10px",
                              color: step.done ? "#111827" : "#fff",
                              display: "inline-block",
                              fontSize: "14px",
                              fontWeight: 700,
                              marginTop: "12px",
                              padding: "8px 12px",
                              textDecoration: "none",
                            }}
                          >
                            {step.done ? "Open" : step.ctaLabel}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, href, variant = "secondary" }) {
  const isPrimary = variant === "primary";

  return (
    <a
      href={href}
      style={{
        background: isPrimary ? "#23262f" : "#ffffff",
        border: isPrimary ? "1px solid #23262f" : "1px solid #d1d5db",
        borderRadius: "12px",
        color: isPrimary ? "#fff" : "#111827",
        fontSize: "14px",
        fontWeight: 700,
        padding: "10px 14px",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

function StepDot({ done }) {
  if (done) {
    return (
      <span
        style={{
          alignItems: "center",
          background: "#23262f",
          borderRadius: "999px",
          color: "#fff",
          display: "inline-flex",
          fontSize: "12px",
          height: "20px",
          justifyContent: "center",
          lineHeight: 1,
          marginTop: "4px",
          width: "20px",
        }}
      >
        ✓
      </span>
    );
  }

  return (
    <span
      style={{
        border: "2px dashed #9ca3af",
        borderRadius: "999px",
        display: "inline-block",
        height: "20px",
        marginTop: "4px",
        width: "20px",
      }}
    />
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
