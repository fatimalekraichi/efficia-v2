(() => {
  "use strict";

  const COOKIE_STORAGE_KEY = "efficiaCookieConsent";
  const CONSENT_VERSION = "2026-08-18-clarity-v1";

  const readCookieConsent = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(COOKIE_STORAGE_KEY) || "null");
      if (!stored || stored.version !== CONSENT_VERSION || typeof stored.analytics !== "boolean") return null;
      return stored;
    } catch {
      return null;
    }
  };

  const saveCookieConsent = (analytics) => {
    const consent = {
      version: CONSENT_VERSION,
      analytics: Boolean(analytics),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(consent));
    return consent;
  };

  const createCookieConsent = () => {
    const banner = document.createElement("div");
    banner.className = "cookie-consent";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Préférences de confidentialité");
    banner.innerHTML = `
      <div class="cookie-consent__inner">
        <div>
          <strong>Votre confidentialité</strong>
          <p>Nous utilisons Microsoft Clarity pour améliorer le site, uniquement avec votre accord. Vous pouvez changer d’avis à tout moment. <a href="/politique-cookies">En savoir plus</a></p>
        </div>
        <div class="cookie-consent__actions">
          <button class="cookie-btn cookie-btn--choice" type="button" data-cookie-accept>Tout accepter</button>
          <button class="cookie-btn cookie-btn--choice" type="button" data-cookie-refuse>Refuser</button>
          <button class="cookie-btn cookie-btn--secondary" type="button" data-cookie-customize>Personnaliser</button>
        </div>
      </div>
    `;

    const preferences = document.createElement("div");
    preferences.className = "cookie-preferences";
    preferences.setAttribute("aria-hidden", "true");
    preferences.setAttribute("inert", "");
    preferences.innerHTML = `
      <div class="cookie-preferences__backdrop" data-cookie-close></div>
      <div class="cookie-preferences__panel" role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title">
        <h2 id="cookie-preferences-title">Gérer mes préférences</h2>
        <p>Clarity reste désactivé tant que vous ne l’acceptez pas.</p>
        <div class="cookie-options">
          <div class="cookie-option">
            <div>
              <strong>Fonctions nécessaires</strong>
              <span>Indispensables au fonctionnement et à la sécurité du site.</span>
            </div>
            <input type="checkbox" checked disabled aria-label="Fonctions nécessaires toujours actives">
          </div>
          <label class="cookie-option">
            <div>
              <strong>Mesure d’audience</strong>
              <span>Nous aide à comprendre l’utilisation du site et à l’améliorer.</span>
            </div>
            <input type="checkbox" data-cookie-analytics>
          </label>
        </div>
        <div class="cookie-preferences__actions">
          <button class="cookie-btn cookie-btn--secondary" type="button" data-cookie-close>Retour</button>
          <button class="cookie-btn cookie-btn--choice" type="button" data-cookie-save>Enregistrer</button>
        </div>
      </div>
    `;

    document.body.append(banner, preferences);
    return { banner, preferences };
  };

  const analytics = window.efficiaAnalytics;
  const { banner, preferences } = createCookieConsent();
  const analyticsInput = preferences.querySelector("[data-cookie-analytics]");
  let lastPreferencesTrigger = null;

  const showCookieBanner = () => window.setTimeout(() => banner.classList.add("is-visible"), 350);
  const hideCookieBanner = () => banner.classList.remove("is-visible");

  const openCookiePreferences = () => {
    lastPreferencesTrigger = document.activeElement;
    analyticsInput.checked = Boolean(readCookieConsent()?.analytics);
    preferences.removeAttribute("inert");
    preferences.setAttribute("aria-hidden", "false");
    preferences.classList.add("is-open");
    analyticsInput.focus({ preventScroll: true });
  };

  const closeCookiePreferences = () => {
    if (preferences.contains(document.activeElement)) {
      if (lastPreferencesTrigger?.isConnected) lastPreferencesTrigger.focus({ preventScroll: true });
      else document.activeElement?.blur?.();
    }
    preferences.classList.remove("is-open");
    preferences.setAttribute("inert", "");
    preferences.setAttribute("aria-hidden", "true");
    lastPreferencesTrigger = null;
  };

  const applyConsent = async (allowed, { reloadAfterWithdrawal = true } = {}) => {
    const previouslyAllowed = Boolean(readCookieConsent()?.analytics);
    saveCookieConsent(allowed);
    hideCookieBanner();
    closeCookiePreferences();

    if (allowed) {
      await analytics?.loadClarity?.();
      return;
    }

    const clarityWasLoaded = analytics?.denyClarityConsent?.() || false;
    if (reloadAfterWithdrawal && previouslyAllowed && clarityWasLoaded) window.location.reload();
  };

  const storedConsent = readCookieConsent();
  if (!storedConsent) {
    showCookieBanner();
  } else if (storedConsent.analytics) {
    analytics?.loadClarity?.();
  } else {
    analytics?.denyClarityConsent?.();
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches("[data-cookie-accept]")) applyConsent(true);
    if (target.matches("[data-cookie-refuse]")) applyConsent(false);

    if (target.matches("[data-cookie-customize], [data-cookie-preferences]")) {
      event.preventDefault();
      openCookiePreferences();
    }

    if (target.matches("[data-cookie-close]")) closeCookiePreferences();
    if (target.matches("[data-cookie-save]")) applyConsent(analyticsInput.checked);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && preferences.classList.contains("is-open")) closeCookiePreferences();
  });

  window.efficiaConsent = Object.freeze({
    version: CONSENT_VERSION,
    read: readCookieConsent,
    openPreferences: openCookiePreferences,
  });
})();
