# Shopify App Store Manual Review Checklist

Use this checklist to gather evidence for requirements that cannot be fully verified from local code.

## 1.1.13 Duplicate only authorized product information

### Goal
Show that your app does not promote unauthorized copying and is positioned for legitimate merchant-owned or authorized content.

### What to verify
- [ ] App listing text does not include claims like "copy any store" or "import from any website."
- [ ] In-app copy describes imports/migration in terms of merchant-owned or authorized content.
- [ ] Help docs and onboarding avoid language suggesting unauthorized scraping or cloning.
- [ ] Any import UI includes clear constraints (for example, public URLs only, no private content).

### Evidence to capture
- [ ] Screenshot of App Store listing copy (features + description sections).
- [ ] Screenshot of in-app import screens and helper text.
- [ ] Link or screenshot of support/onboarding docs with compliant phrasing.

### Pass criteria
All merchant-facing messaging consistently frames imports as authorized usage and avoids deceptive or non-compliant claims.

---

## 1.2.2 Implement Shopify Managed Pricing or Billing API correctly

### Goal
Prove that billing handles approval, decline, and reinstall/re-subscribe flows reliably.

### Test setup
- [ ] Install app on a test store with billing enabled.
- [ ] Ensure at least one paid plan is available.

### Manual test steps
1. **Approval flow**
   - [ ] Start paid subscription from app settings/plans page.
   - [ ] Approve charge in Shopify confirmation screen.
   - [ ] Confirm app returns to app UI and plan status updates correctly.
2. **Decline flow**
   - [ ] Start paid subscription again (or from another test store).
   - [ ] Decline charge in Shopify confirmation screen.
   - [ ] Confirm app handles decline gracefully (no broken page, clear state/message).
3. **Reinstall/resubscribe flow**
   - [ ] Uninstall app.
   - [ ] Reinstall app.
   - [ ] Start plan selection again and confirm charge can be approved successfully.
   - [ ] Confirm app status reflects active plan after reinstall.
4. **Plan change flow (if multiple plans)**
   - [ ] Upgrade/downgrade plan from within app UI.
   - [ ] Confirm charge history/state updates without requiring support or reinstall.

### Evidence to capture
- [ ] Screen recording or screenshots of approve, decline, and reinstall flows.
- [ ] Screenshot of final plan state in app settings.
- [ ] Shopify charge confirmation screens (approved and declined).

### Pass criteria
Merchants can approve/decline charges cleanly, and can subscribe again after reinstall without failures.

---

## 2.2.3 Use the latest version of Shopify App Bridge

### Goal
Show the app uses current App Bridge setup and works in embedded admin context.

### What to verify
- [ ] `@shopify/app-bridge-react` dependency is current and installed.
- [ ] App loads embedded in Shopify Admin without auth/session issues.
- [ ] No legacy `@shopify/app-bridge` package usage remains.
- [ ] Session token dependent actions (authenticated requests) succeed in embedded context.

### Browser/runtime checks
- [ ] Open app from Shopify Admin and navigate across core pages.
- [ ] Confirm no App Bridge initialization errors in browser console.
- [ ] Confirm protected API calls return success while embedded.

### Evidence to capture
- [ ] Screenshot of `package.json` dependency line for `@shopify/app-bridge-react`.
- [ ] Screenshot/video of app running embedded inside Shopify Admin.
- [ ] Browser console screenshot showing no App Bridge errors on load/navigation.

### Pass criteria
App Bridge-based embedded experience is functional and stable, with no legacy package usage.

---

## 3.1.1 Use a valid TLS/SSL certificate

### Goal
Demonstrate that production app endpoints are served over valid HTTPS.

### Manual checks
- [ ] Open production app URL in browser and confirm HTTPS padlock is present.
- [ ] Inspect certificate details: valid (not expired), trusted chain, correct hostname.
- [ ] Confirm OAuth callback URL uses HTTPS and is reachable.
- [ ] Confirm there is no HTTP-only entry path used in install/auth flows.

### Optional command-line checks
- [ ] `curl -Iv https://<your-app-domain>` shows successful TLS handshake.
- [ ] SSL Labs (or equivalent) report does not show critical certificate issues.

### Evidence to capture
- [ ] Screenshot of browser certificate panel for production domain.
- [ ] Screenshot of app URL in browser with padlock.
- [ ] Output snippet from TLS check (`curl -Iv` or SSL scanner).

### Pass criteria
All merchant-facing app endpoints use valid HTTPS with a trusted, non-expired certificate.

---

## Submission Packet (Recommended)

Before submitting, collect these artifacts into one folder:
- [ ] `billing-approve-flow.png`
- [ ] `billing-decline-flow.png`
- [ ] `billing-reinstall-flow.png`
- [ ] `theme-extension-onboarding.png`
- [ ] `embedded-app-bridge-ok.png`
- [ ] `tls-certificate-valid.png`
- [ ] `listing-copy-compliance.png`

If review asks for clarifications, reply with these artifacts plus a short explanation per requirement.
