const revealTargets = document.querySelectorAll(
  ".section-heading, .feature-card, .profile-card, .optimization-item, .timeline-step, .price-card, .pricing-reassurance, .faq-list details, .final-cta-inner"
);

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
  );

  revealTargets.forEach((target) => {
    target.setAttribute("data-reveal", "");
    revealObserver.observe(target);
  });
} else {
  revealTargets.forEach((target) => {
    target.setAttribute("data-reveal", "");
    target.classList.add("is-visible");
  });
}

const modal = document.querySelector("#diagnostic-modal");
const modalDialog = modal?.querySelector(".conversion-modal__dialog");
const modalTriggers = document.querySelectorAll('[data-form-step="diagnostic-start"]');
const closeButtons = modal?.querySelectorAll("[data-modal-close]") || [];
const stepOneForm = modal?.querySelector('[data-step="1"]');
const stepTwoForm = modal?.querySelector('[data-step="2"]');
const confirmationStep = modal?.querySelector('[data-step="3"]');
const stepOneErrorMessage = modal?.querySelector("[data-step-one-error]");
const stepTwoErrorMessage = modal?.querySelector("[data-step-two-error]");
const unknownGoogleBusinessField = stepTwoForm?.querySelector('input[name="unknownGoogleBusiness"]');
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
let lastFocusedElement = null;
let leadDraft = {};

const showStep = (step) => {
  modal?.querySelectorAll(".conversion-step").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.step === String(step));
  });
};

const focusFirstField = () => {
  const activeStep = modal?.querySelector(".conversion-step.is-active");
  const firstField = activeStep?.querySelector("input, button");
  firstField?.focus({ preventScroll: true });
};

const resetModal = () => {
  showStep(1);
  modal?.querySelectorAll(".has-error").forEach((item) => item.classList.remove("has-error"));
  modal?.querySelectorAll(".conversion-submit.is-loading").forEach((button) => button.classList.remove("is-loading"));
  if (unknownGoogleBusinessField) unknownGoogleBusinessField.checked = false;
  modal?.querySelectorAll(".conversion-form-error").forEach((message) => {
    message.textContent = "";
  });
  updateDiagnosticFields();
};

const openModal = () => {
  if (!modal) return;
  lastFocusedElement = document.activeElement;
  resetModal();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(focusFirstField, 80);
};

const closeModal = () => {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  lastFocusedElement?.focus?.({ preventScroll: true });
};

const isValidUrl = (value) => {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

const validateField = (field) => {
  const wrapper = field.closest("label");
  let isValid = true;

  if (field.required && !field.value.trim()) {
    isValid = false;
  }

  if (field.type === "email" && field.value.trim() && !isValidEmail(field.value)) {
    isValid = false;
  }

  if (field.type === "url" && !isValidUrl(field.value)) {
    isValid = false;
  }

  wrapper?.classList.toggle("has-error", !isValid);
  return isValid;
};

const validateRadioGroup = (fieldset) => {
  const requiredInput = fieldset.querySelector("input[required]");
  if (!requiredInput) return true;
  const isValid = Boolean(fieldset.querySelector("input:checked"));
  fieldset.classList.toggle("has-error", !isValid);
  return isValid;
};

const validateForm = (form) => {
  const fields = Array.from(form.querySelectorAll("input:not([type='radio'])"));
  const radioGroups = Array.from(form.querySelectorAll(".conversion-radios"));
  const fieldsValid = fields.map(validateField).every(Boolean);
  const radiosValid = radioGroups.map(validateRadioGroup).every(Boolean);
  const firstError = form.querySelector(".has-error input, .has-error label input");

  firstError?.focus({ preventScroll: false });
  return fieldsValid && radiosValid;
};

const setFieldState = (field, isValid) => {
  field?.closest("label")?.classList.toggle("has-error", !isValid);
};

const updateDiagnosticFields = () => {
  if (!stepTwoForm) return;

  const isUnknown = Boolean(unknownGoogleBusinessField?.checked);
  const googleBusinessWrapper = stepTwoForm.querySelector("[data-google-business-field]");
  const googleBusinessField = stepTwoForm.querySelector('input[name="googleBusiness"]');
  const fallbackWrappers = stepTwoForm.querySelectorAll("[data-business-fallback]");
  const fallbackFields = stepTwoForm.querySelectorAll('input[name="company"], input[name="city"]');

  googleBusinessWrapper?.classList.toggle("is-hidden", isUnknown);
  if (googleBusinessWrapper) googleBusinessWrapper.hidden = isUnknown;
  if (googleBusinessField) {
    googleBusinessField.disabled = isUnknown;
    googleBusinessField.required = !isUnknown;
    if (isUnknown) googleBusinessField.value = "";
    setFieldState(googleBusinessField, true);
  }

  fallbackWrappers.forEach((wrapper) => {
    wrapper.classList.toggle("is-hidden", !isUnknown);
    wrapper.hidden = !isUnknown;
  });
  fallbackFields.forEach((field) => {
    field.disabled = !isUnknown;
    field.required = isUnknown;
    if (!isUnknown) field.value = "";
    setFieldState(field, true);
  });

  if (stepTwoErrorMessage) stepTwoErrorMessage.textContent = "";
};

const validateDiagnosticLookup = (form) => {
  const googleBusinessField = form.querySelector('input[name="googleBusiness"]');
  const companyField = form.querySelector('input[name="company"]');
  const cityField = form.querySelector('input[name="city"]');
  const isUnknown = Boolean(form.querySelector('input[name="unknownGoogleBusiness"]')?.checked);
  const hasGoogleBusiness = Boolean(googleBusinessField?.value.trim());
  const hasCompany = Boolean(companyField?.value.trim());
  const hasCity = Boolean(cityField?.value.trim());
  let isValid = true;

  if (isUnknown) {
    isValid = hasCompany && hasCity;
    setFieldState(companyField, hasCompany);
    setFieldState(cityField, hasCity);
  } else {
    isValid = hasGoogleBusiness && validateField(googleBusinessField);
    setFieldState(googleBusinessField, isValid);
  }

  if (stepTwoErrorMessage) {
    stepTwoErrorMessage.textContent = isValid
      ? ""
      : "Ajoutez le lien Google Business ou cochez l’option pour indiquer le nom de l’entreprise et sa ville.";
  }

  if (!isValid) {
    const firstError = form.querySelector(".has-error input");
    firstError?.focus({ preventScroll: false });
  }

  return isValid;
};

const setLoading = (form, isLoading, loadingLabel = "Envoi en cours…") => {
  const button = form.querySelector(".conversion-submit");
  button?.classList.toggle("is-loading", isLoading);
  if (!button) return;

  const label = button.querySelector("span:first-child");
  if (label) {
    if (isLoading) {
      button.dataset.defaultLabel = label.textContent;
      label.textContent = loadingLabel;
    } else if (button.dataset.defaultLabel) {
      label.textContent = button.dataset.defaultLabel;
      delete button.dataset.defaultLabel;
    }
  }

  button.disabled = isLoading;
};

const getFormData = (form) => {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
};

const wait = (duration) => new Promise((resolve) => {
  window.setTimeout(resolve, duration);
});

const submitLeadRequest = async (payload) => {
  window.efficiaLeadPayload = payload;
  const response = await fetch("/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  const responseText = await response.text();
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = { raw: responseText };
  }

  console.log("Réponse /subscribe", {
    status: response.status,
    ok: response.ok,
    data,
  });

  if (!response.ok) {
    console.error("Erreur API /subscribe", {
      status: response.status,
      data,
    });
    throw new Error("Lead submission failed");
  }

  if (!data?.success) {
    console.error("Erreur API /subscribe", data);
    throw new Error("Lead submission failed");
  }

  return data;
};

modalTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openModal();
  });
});

closeButtons.forEach((button) => {
  button.addEventListener("click", closeModal);
});

modal?.addEventListener("click", (event) => {
  if (event.target.matches("[data-modal-close]")) closeModal();
});

modal?.addEventListener("input", (event) => {
  if (event.target.matches("input:not([type='radio'])")) validateField(event.target);
  if (event.target.matches("input[type='radio']")) {
    event.target.closest(".conversion-radios")?.classList.remove("has-error");
  }
  if (event.target === unknownGoogleBusinessField) {
    updateDiagnosticFields();
  }
  if (event.target.closest('[data-step="2"]') && stepTwoErrorMessage) {
    stepTwoErrorMessage.textContent = "";
  }
});

modal?.addEventListener("blur", (event) => {
  if (event.target.matches("input:not([type='radio'])")) validateField(event.target);
}, true);

stepOneForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateForm(stepOneForm)) return;

  setLoading(stepOneForm, true, "Enregistrement…");
  if (stepOneErrorMessage) stepOneErrorMessage.textContent = "";

  try {
    leadDraft = getFormData(stepOneForm);
    const createdAt = new Date().toISOString();
    const payload = {
      step: "lead_capture",
      first_name: leadDraft.firstName,
      email: leadDraft.email,
      audit_status: "lead capturé",
      source: "Score Efficia gratuit",
      created_at: createdAt,
    };
    console.log("lead_capture envoyé", payload);
    await Promise.all([
      submitLeadRequest(payload),
      wait(650),
    ]);
    console.log("lead_capture succès");
    leadDraft.createdAt = createdAt;
    setLoading(stepOneForm, false);
    showStep(2);
    focusFirstField();
  } catch (error) {
    console.error("lead_capture erreur", error);
    setLoading(stepOneForm, false);
    if (stepOneErrorMessage) {
      stepOneErrorMessage.textContent = "Une erreur est survenue. Merci de réessayer dans quelques instants.";
    }
  }
});

stepTwoForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateDiagnosticLookup(stepTwoForm)) return;

  setLoading(stepTwoForm, true);
  if (stepTwoErrorMessage) stepTwoErrorMessage.textContent = "";

  try {
    const stepTwoData = getFormData(stepTwoForm);
    const payload = {
      step: "diagnostic_request",
      first_name: leadDraft.firstName,
      email: leadDraft.email,
      company_name: stepTwoData.company,
      google_business_url: stepTwoData.googleBusiness,
      city: stepTwoData.city,
      audit_status: "diagnostic demandé",
      completed_step_2: true,
      source: "Score Efficia gratuit",
      created_at: leadDraft.createdAt || new Date().toISOString(),
      submitted_at: new Date().toISOString(),
    };
    console.log("diagnostic_request envoyé", payload);
    await Promise.all([submitLeadRequest(payload), wait(650)]);
    console.log("diagnostic_request succès");
    setLoading(stepTwoForm, false);
    showStep(3);
    confirmationStep?.querySelector("button")?.focus({ preventScroll: true });
  } catch (error) {
    console.error("diagnostic_request erreur", error);
    setLoading(stepTwoForm, false);
    if (stepTwoErrorMessage) {
      stepTwoErrorMessage.textContent = "Une erreur est survenue. Merci de réessayer dans quelques instants.";
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (!modal?.classList.contains("is-open")) return;

  if (event.key === "Escape") {
    closeModal();
    return;
  }

  if (event.key !== "Tab" || !modalDialog) return;

  const focusableElements = Array.from(modalDialog.querySelectorAll(focusableSelector))
    .filter((element) => element.offsetParent !== null);
  if (!focusableElements.length) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
});

const PAYMENTS_ENABLED = false;
const checkoutButtons = document.querySelectorAll("[data-checkout-product]");
const pricingError = document.querySelector("[data-pricing-error]");

const checkoutDefaultLabels = new WeakMap();

const setCheckoutButtonState = (button, isLoading, label) => {
  if (!checkoutDefaultLabels.has(button)) {
    checkoutDefaultLabels.set(button, button.textContent.trim());
  }

  button.setAttribute("aria-disabled", String(isLoading));
  button.textContent = isLoading ? label : checkoutDefaultLabels.get(button);
};

const showPricingError = (message) => {
  if (!pricingError) return;
  pricingError.textContent = message;
};

const submitCheckoutRequest = async (product) => {
  const response = await fetch("/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ product }),
  });

  const data = await response.json().catch(() => ({}));
  console.log("Réponse /create-checkout-session", {
    ok: response.ok,
    status: response.status,
    data,
  });

  if (!response.ok || !data.success || !data.url) {
    throw new Error(data.error || "Checkout session failed.");
  }

  return data.url;
};

checkoutButtons.forEach((button) => {
  checkoutDefaultLabels.set(button, button.textContent.trim());

  if (!PAYMENTS_ENABLED) {
    setCheckoutButtonState(button, true, "Paiements bientôt disponibles");
    return;
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    const product = button.getAttribute("data-checkout-product");
    showPricingError("");

    setCheckoutButtonState(button, true, "Redirection vers le paiement…");

    try {
      const checkoutUrl = await submitCheckoutRequest(product);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Erreur Stripe Checkout", error);
      setCheckoutButtonState(button, false);
      showPricingError("Une erreur est survenue. Merci de réessayer dans quelques instants.");
    }
  });
});
