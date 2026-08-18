(() => {
  "use strict";

  const CLARITY_PROJECT_ID = "y4bpqqcrs7";
  const CLARITY_SCRIPT_ID = "efficia-clarity-script";
  const ALLOWED_EVENTS = new Set([
    "diagnostic_cta_click",
    "diagnostic_step_1_view",
    "diagnostic_step_1_complete",
    "diagnostic_step_2_view",
    "diagnostic_submitted",
    "diagnostic_confirmation_view",
    "audit_detail_click",
    "audit_offer_click",
    "pack_offer_click",
    "begin_checkout",
    "checkout_success_view",
  ]);
  const ALLOWED_OFFERS = new Set(["audit", "visibility", "performance"]);
  const sentEvents = new Set();
  let clarityEnabled = false;
  let clarityLoadPromise = null;

  const callClarity = (...args) => {
    try {
      if (typeof window.clarity !== "function") return false;
      window.clarity(...args);
      return true;
    } catch {
      return false;
    }
  };

  const initializeClarityQueue = () => {
    if (typeof window.clarity === "function") return;
    window.clarity = function clarityQueue() {
      window.clarity.q = window.clarity.q || [];
      window.clarity.q.push(arguments);
    };
  };

  const grantClarityConsent = () => {
    callClarity("consentv2", {
      ad_Storage: "denied",
      analytics_Storage: "granted",
    });
  };

  const trackPendingCheckoutConfirmation = () => {
    const offer = document.body?.dataset.checkoutConfirmedOffer;
    if (ALLOWED_OFFERS.has(offer)) trackAnalyticsEvent("checkout_success_view", { offer });
  };

  const loadClarity = () => {
    if (clarityLoadPromise) return clarityLoadPromise;

    clarityLoadPromise = new Promise((resolve) => {
      initializeClarityQueue();
      grantClarityConsent();
      const existingScript = document.getElementById(CLARITY_SCRIPT_ID);
      if (existingScript) {
        clarityEnabled = true;
        grantClarityConsent();
        trackPendingCheckoutConfirmation();
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.id = CLARITY_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
      script.referrerPolicy = "strict-origin-when-cross-origin";
      script.addEventListener("load", () => {
        clarityEnabled = true;
        grantClarityConsent();
        trackPendingCheckoutConfirmation();
        resolve(true);
      }, { once: true });
      script.addEventListener("error", () => {
        clarityEnabled = false;
        clarityLoadPromise = null;
        resolve(false);
      }, { once: true });
      document.head.appendChild(script);
    });

    return clarityLoadPromise;
  };

  const deleteClarityCookies = () => {
    const cookieNames = ["_clck", "_clsk", "CLID", "ANONCHK", "MR", "MUID", "SM"];
    const hostParts = window.location.hostname.split(".");
    const domains = [window.location.hostname, `.${window.location.hostname}`];
    if (hostParts.length > 2) domains.push(`.${hostParts.slice(-2).join(".")}`);

    cookieNames.forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}; SameSite=Lax`;
      });
    });
  };

  const denyClarityConsent = () => {
    const wasLoaded = Boolean(document.getElementById(CLARITY_SCRIPT_ID)) || clarityEnabled;
    if (wasLoaded) {
      callClarity("consentv2", {
        ad_Storage: "denied",
        analytics_Storage: "denied",
      });
      callClarity("consent", false);
    }
    clarityEnabled = false;
    sentEvents.clear();
    deleteClarityCookies();
    return wasLoaded;
  };

  const trackAnalyticsEvent = (eventName, options = {}) => {
    if (!clarityEnabled || !ALLOWED_EVENTS.has(eventName)) return false;

    const offer = ALLOWED_OFFERS.has(options.offer) ? options.offer : "";
    const dedupeKey = `${eventName}:${offer}`;
    if (sentEvents.has(dedupeKey)) return false;

    if (offer && !callClarity("set", "offer_type", offer)) return false;
    if (!callClarity("event", eventName)) return false;
    sentEvents.add(dedupeKey);
    return true;
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;

    let url;
    try {
      url = new URL(link.href, window.location.origin);
    } catch {
      return;
    }

    if (url.origin !== window.location.origin) return;
    const isAuditDetailPath = url.pathname === "/audit-google-business" || url.pathname === "/audit-google-business.html";
    const alreadyOnAuditDetail = window.location.pathname === "/audit-google-business" || window.location.pathname === "/audit-google-business.html";
    if (isAuditDetailPath && !alreadyOnAuditDetail) {
      trackAnalyticsEvent("audit_detail_click");
      return;
    }
    if (url.pathname !== "/achat" && url.pathname !== "/achat.html") return;

    const offer = url.searchParams.get("offre");
    if (offer === "audit") {
      trackAnalyticsEvent("audit_offer_click", { offer });
    } else if (offer === "visibility" || offer === "performance") {
      trackAnalyticsEvent("pack_offer_click", { offer });
    }
  });

  document.addEventListener("efficia:checkout-confirmed", (event) => {
    const offer = event.detail?.offer;
    if (ALLOWED_OFFERS.has(offer)) trackAnalyticsEvent("checkout_success_view", { offer });
  });

  window.efficiaAnalytics = Object.freeze({
    loadClarity,
    denyClarityConsent,
    trackAnalyticsEvent,
    isClarityEnabled: () => clarityEnabled,
  });
  window.trackAnalyticsEvent = trackAnalyticsEvent;
})();
