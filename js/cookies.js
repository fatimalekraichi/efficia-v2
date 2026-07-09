const COOKIE_STORAGE_KEY = "efficiaCookieConsent";

const defaultCookieConsent = {
  necessary: true,
  statistics: false,
  marketing: false,
};

const readCookieConsent = () => {
  try {
    const storedConsent = localStorage.getItem(COOKIE_STORAGE_KEY);
    return storedConsent ? JSON.parse(storedConsent) : null;
  } catch {
    return null;
  }
};

const saveCookieConsent = (preferences) => {
  localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify({
    ...defaultCookieConsent,
    ...preferences,
    necessary: true,
    savedAt: new Date().toISOString(),
  }));
};

const createCookieConsent = () => {
  const banner = document.createElement("div");
  banner.className = "cookie-consent";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Consentement aux cookies");
  banner.innerHTML = `
    <button class="cookie-consent__close" type="button" aria-label="Fermer la bannière cookies" data-cookie-dismiss>×</button>
    <div class="cookie-consent__inner">
      <div>
        <strong>Cookies</strong>
        <p>Nous utilisons des cookies pour améliorer votre expérience, mesurer l’audience du site et optimiser nos services.</p>
      </div>
      <div class="cookie-consent__actions">
        <button class="cookie-btn primary" type="button" data-cookie-accept>Accepter</button>
        <button class="cookie-btn" type="button" data-cookie-refuse>Refuser</button>
        <button class="cookie-btn" type="button" data-cookie-customize>Personnaliser</button>
      </div>
    </div>
  `;

  const preferences = document.createElement("div");
  preferences.className = "cookie-preferences";
  preferences.setAttribute("aria-hidden", "true");
  preferences.innerHTML = `
    <div class="cookie-preferences__backdrop" data-cookie-close></div>
    <div class="cookie-preferences__panel" role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title">
      <h2 id="cookie-preferences-title">Préférences cookies</h2>
      <p>Vous pouvez choisir les cookies que vous acceptez. Les cookies nécessaires restent toujours actifs.</p>
      <div class="cookie-options">
        <div class="cookie-option">
          <div>
            <strong>Cookies nécessaires</strong>
            <span>Toujours actifs pour assurer le bon fonctionnement du site.</span>
          </div>
          <input type="checkbox" checked disabled aria-label="Cookies nécessaires toujours actifs">
        </div>
        <label class="cookie-option">
          <div>
            <strong>Cookies statistiques</strong>
            <span>Nous aident à comprendre l’utilisation du site.</span>
          </div>
          <input type="checkbox" data-cookie-statistics>
        </label>
        <label class="cookie-option">
          <div>
            <strong>Cookies marketing</strong>
            <span>Peuvent mesurer l’efficacité de campagnes.</span>
          </div>
          <input type="checkbox" data-cookie-marketing>
        </label>
      </div>
      <div class="cookie-preferences__actions">
        <button class="cookie-btn" type="button" data-cookie-close>Annuler</button>
        <button class="cookie-btn primary" type="button" data-cookie-save>Enregistrer mes choix</button>
      </div>
    </div>
  `;

  document.body.append(banner, preferences);
  return { banner, preferences };
};

const { banner, preferences } = createCookieConsent();
const statisticsInput = preferences.querySelector("[data-cookie-statistics]");
const marketingInput = preferences.querySelector("[data-cookie-marketing]");

const showCookieBanner = () => window.setTimeout(() => banner.classList.add("is-visible"), 350);
const hideCookieBanner = () => banner.classList.remove("is-visible");

const openCookiePreferences = () => {
  const storedConsent = readCookieConsent();
  statisticsInput.checked = Boolean(storedConsent?.statistics);
  marketingInput.checked = Boolean(storedConsent?.marketing);
  preferences.classList.add("is-open");
  preferences.setAttribute("aria-hidden", "false");
  preferences.querySelector("[data-cookie-statistics]")?.focus({ preventScroll: true });
};

const closeCookiePreferences = () => {
  preferences.classList.remove("is-open");
  preferences.setAttribute("aria-hidden", "true");
};

const setConsentAndClose = (settings) => {
  saveCookieConsent(settings);
  hideCookieBanner();
  closeCookiePreferences();
};

const dismissWithFullConsent = () => {
  setConsentAndClose({ statistics: true, marketing: true });
};

if (!readCookieConsent()) {
  showCookieBanner();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.matches("[data-cookie-accept]")) {
    setConsentAndClose({ statistics: true, marketing: true });
  }

  if (target.matches("[data-cookie-refuse]")) {
    setConsentAndClose({ statistics: false, marketing: false });
  }

  if (target.matches("[data-cookie-dismiss]")) {
    dismissWithFullConsent();
  }

  if (target.matches("[data-cookie-customize], [data-cookie-preferences]")) {
    event.preventDefault();
    openCookiePreferences();
  }

  if (target.matches("[data-cookie-close]")) {
    closeCookiePreferences();
  }

  if (target.matches("[data-cookie-save]")) {
    setConsentAndClose({
      statistics: statisticsInput.checked,
      marketing: marketingInput.checked,
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && preferences.classList.contains("is-open")) {
    closeCookiePreferences();
  }
});
