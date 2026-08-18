const OFFERS = {
  audit: {
    name: "Audit fiche Google",
    price: "99 € TTC",
    amount: "99 €",
    tax: "TTC",
    taxNote: "TVA comprise — aucun supplément de TVA au paiement.",
  },
  visibility: {
    name: "Pack Visibilité Google",
    price: "349 € TTC",
    amount: "349 €",
    tax: "TTC",
    taxNote: "TVA comprise — aucun supplément de TVA au paiement.",
  },
  performance: {
    name: "Pack Performance",
    price: "499 € TTC",
    amount: "499 €",
    tax: "TTC",
    taxNote: "TVA comprise — aucun supplément de TVA au paiement.",
  },
};

const form = document.querySelector("[data-purchase-form]");
const submitButton = document.querySelector("[data-purchase-submit]");
const errorMessage = document.querySelector("[data-purchase-error]");
const offerName = document.querySelector("[data-offer-name]");
const offerPrice = document.querySelector("[data-offer-price]");
const offerTaxNote = document.querySelector("[data-offer-tax-note]");
const unknownGoogleBusiness = document.querySelector("[data-unknown-google-business]");
const googleBusinessWrapper = document.querySelector("[data-google-business-field]");
const googleBusinessField = googleBusinessWrapper?.querySelector("input");
const cityWrapper = document.querySelector("[data-city-field]");
const cityField = cityWrapper?.querySelector("input");
const cgvAcceptance = document.querySelector("[data-cgv-acceptance]");
const cgvError = document.querySelector("[data-cgv-error]");

const CGV_ACCEPTANCE_ERROR = "Vous devez lire et accepter les Conditions générales de vente avant de poursuivre.";

const product = new URLSearchParams(window.location.search).get("offre") || "visibility";
const selectedOffer = OFFERS[product] ? product : "visibility";

if (offerName) offerName.textContent = OFFERS[selectedOffer].name;
if (offerPrice) {
  const amount = document.createElement("span");
  amount.className = "purchase-price__amount";
  amount.textContent = OFFERS[selectedOffer].amount;
  const tax = document.createElement("span");
  tax.className = "purchase-price__tax";
  tax.textContent = OFFERS[selectedOffer].tax;
  offerPrice.replaceChildren(amount, " ", tax);
}
if (offerTaxNote) {
  offerTaxNote.textContent = OFFERS[selectedOffer].taxNote || "";
  offerTaxNote.hidden = !OFFERS[selectedOffer].taxNote;
}

const setError = (message) => {
  if (!errorMessage) return;
  errorMessage.textContent = message;
};

const setCgvError = (message) => {
  if (!cgvError) return;
  cgvError.textContent = message;
  cgvAcceptance?.setAttribute("aria-invalid", String(Boolean(message)));
};

const setLoading = (isLoading) => {
  if (!submitButton) return;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Redirection vers le paiement…" : "Continuer vers le paiement sécurisé";
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

const isValidUrl = (value) => {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const markField = (field, isValid) => {
  const wrapper = field?.closest(".purchase-field");
  if (!wrapper) return;
  wrapper.classList.toggle("has-error", !isValid);
};

const toggleBusinessFields = () => {
  const isUnknown = Boolean(unknownGoogleBusiness?.checked);

  googleBusinessWrapper?.classList.toggle("is-hidden", isUnknown);
  cityWrapper?.classList.toggle("is-hidden", !isUnknown);

  if (googleBusinessField) {
    googleBusinessField.required = !isUnknown;
    googleBusinessField.disabled = isUnknown;
    if (isUnknown) googleBusinessField.value = "";
    markField(googleBusinessField, true);
  }

  if (cityField) {
    cityField.required = isUnknown;
    cityField.disabled = !isUnknown;
    if (!isUnknown) cityField.value = "";
    markField(cityField, true);
  }
};

const validateForm = (formElement) => {
  const formData = new FormData(formElement);
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const companyName = String(formData.get("company_name") || "").trim();
  const googleBusinessUrl = String(formData.get("google_business_url") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const isUnknown = Boolean(unknownGoogleBusiness?.checked);

  if (!cgvAcceptance?.checked) {
    setCgvError(CGV_ACCEPTANCE_ERROR);
    cgvAcceptance?.focus({ preventScroll: true });
    return null;
  }

  setCgvError("");

  const fullNameField = formElement.querySelector('input[name="full_name"]');
  const emailField = formElement.querySelector('input[name="email"]');
  const companyField = formElement.querySelector('input[name="company_name"]');

  const checks = [
    [fullNameField, fullName.length >= 2],
    [emailField, isValidEmail(email)],
    [companyField, companyName.length >= 2],
  ];

  if (isUnknown) {
    checks.push([cityField, city.length >= 2]);
  } else {
    checks.push([googleBusinessField, Boolean(googleBusinessUrl) && isValidUrl(googleBusinessUrl)]);
  }

  checks.forEach(([field, isValid]) => markField(field, isValid));

  const firstInvalid = checks.find(([, isValid]) => !isValid);
  if (firstInvalid) {
    firstInvalid[0]?.focus({ preventScroll: true });
    setError("Merci de vérifier les champs indiqués.");
    return null;
  }

  return {
    product: selectedOffer,
    full_name: fullName,
    email,
    company_name: companyName,
    google_business_url: isUnknown ? "" : googleBusinessUrl,
    unknown_google_business: isUnknown,
    city: isUnknown ? city : "",
    cgv_accepted: true,
    cgv_version: formElement.dataset.cgvVersion || "",
  };
};

unknownGoogleBusiness?.addEventListener("change", toggleBusinessFields);
toggleBusinessFields();

cgvAcceptance?.addEventListener("change", () => {
  if (cgvAcceptance.checked) setCgvError("");
});

form?.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement) {
    markField(event.target, true);
    setError("");
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");

  const payload = validateForm(form);
  if (!payload) return;

  setLoading(true);

  try {
    const response = await fetch("/prepare-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    console.log("Réponse /prepare-checkout", {
      ok: response.ok,
      status: response.status,
      data,
    });

    if (!response.ok || !data.success || !data.url) {
      throw new Error(data.error || "Checkout preparation failed.");
    }

    window.location.href = data.url;
  } catch (error) {
    console.error("Erreur préparation paiement", error);
    setLoading(false);
    setError(`Une erreur est survenue. Merci de réessayer dans quelques instants. (${error.message})`);
  }
});
