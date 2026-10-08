(() => {
  "use strict";
  if (window.efficiaGA4) return;

  const ID = "G-1V7NDZGLG4";
  const SCRIPT_ID = "efficia-ga4-script";
  // Closed list: never report arbitrary paths, query strings, fragments or titles.
  const PAGES = new Map([
    ["/", "Accueil"], ["/index", "Accueil"],
    ["/diagnostic-gratuit", "Diagnostic gratuit"],
    ["/optimisation-google-business", "Optimisation Google Business"],
    ["/services", "Services"], ["/a-propos", "À propos"], ["/contact", "Contact"],
    ["/audit-google-business", "Audit Google Business"],
    ["/refonte-site-internet", "Création / refonte de site"],
    ["/achat", "Commande"], ["/paiement-reussi", "Confirmation du paiement"],
    ["/mentions-legales", "Mentions légales"], ["/cgv", "CGV"],
    ["/politique-confidentialite", "Confidentialité"],
    ["/politique-cookies", "Cookies"], ["/404", "Page introuvable"],
  ]);
  const path = window.location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  const eligible = window.location.protocol === "https:"
    && ["efficiadigital.com", "www.efficiadigital.com"].includes(window.location.hostname)
    && PAGES.has(path);
  const page = {
    page_location: `https://efficiadigital.com${path === "/index" ? "/" : path}`,
    page_title: PAGES.get(path),
    page_referrer: "",
  };
  let allowed = false;
  let ready = false;
  let configured = false;
  let viewed = false;
  const completed = new Set();
  window[`ga-disable-${ID}`] = true;

  function command() {
    window.efficiaGA4Layer = window.efficiaGA4Layer || [];
    window.efficiaGA4Layer.push(arguments);
  };
  const emit = (name, params = {}) => {
    if (!allowed || !ready || !eligible) return false;
    command("event", name, { ...page, ...params, send_to: ID });
    return true;
  };
  const activate = () => {
    if (!allowed || !ready) return;
    window[`ga-disable-${ID}`] = false;
    if (!configured) {
      command("consent", "default", {
        analytics_storage: "granted", ad_storage: "denied",
        ad_user_data: "denied", ad_personalization: "denied",
      });
      command("js", new Date());
      command("config", ID, {
        ...page, send_page_view: false,
        allow_google_signals: false, allow_ad_personalization_signals: false,
        cookie_expires: 60 * 60 * 24 * 180, cookie_update: false,
      });
      configured = true;
    }
    if (!viewed) viewed = emit("page_view");
  };
  const deleteCookies = () => {
    const names = document.cookie.split(";").map(item => item.trim().split("=")[0])
      .filter(name => name === "_ga" || name.startsWith("_ga_"));
    const host = window.location.hostname;
    const domains = ["", host, `.${host}`, "efficiadigital.com", ".efficiadigital.com"];
    for (const name of names) for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/;${domain ? ` Domain=${domain};` : ""} SameSite=Lax`;
    }
  };
  const setConsent = (value) => {
    allowed = value === true && eligible;
    if (!allowed) {
      // Disable first; no denied-consent ping and no replay of queued events.
      window[`ga-disable-${ID}`] = true;
      if (Array.isArray(window.efficiaGA4Layer)) window.efficiaGA4Layer.length = 0;
      deleteCookies();
      return;
    }
    if (ready) return activate();
    if (document.getElementById(SCRIPT_ID)) return;
    window.efficiaGA4Layer = [];
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ID}&l=efficiaGA4Layer`;
    script.addEventListener("load", () => { ready = true; activate(); }, { once: true });
    script.addEventListener("error", () => { ready = false; script.remove(); }, { once: true });
    document.head.appendChild(script);
  };
  const trackFormSuccess = (formName, localKey, topic = "") => {
    if (!["diagnostic", "site_request", "contact"].includes(formName)) return false;
    // The idempotency key stays in memory; never forward it to Google.
    const key = `${formName}:${localKey}`;
    if (completed.has(key)) return false;
    completed.add(key);
    const params = { form_name: formName };
    if (formName === "contact" && ["", "google", "site", "les-deux", "ne-sait-pas"].includes(topic)) params.topic = topic;
    return emit("generate_lead", params);
  };
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    let url;
    try { url = new URL(link.href, window.location.origin); } catch { return; }
    const channel = url.protocol === "tel:" ? "phone"
      : url.protocol === "mailto:" ? "email"
      : (url.protocol === "https:" && ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(url.hostname)) ? "whatsapp" : null;
    if (channel) emit("contact_click", { contact_method: channel });
    const location = link.dataset?.trackLocation;
    if (url.protocol === "https:" && url.hostname === "wa.me"
      && ["sticky_bar", "header", "footer", "contact_page", "menu"].includes(location)) {
      emit("whatsapp_click", { link_location: location });
    }
    if (url.origin === window.location.origin && /^\/contact(?:\.html)?\/?$/.test(url.pathname)
      && ["hero", "sticky_bar", "header", "process", "final_cta", "menu", "footer"].includes(location)) {
      emit("contact_cta_click", { link_location: location });
    }
  });
  window.efficiaGA4 = Object.freeze({ setConsent, trackFormSuccess });
})();
