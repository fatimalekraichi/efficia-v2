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
const messageTextarea = modal?.querySelector('textarea[name="message"]');
const characterCount = modal?.querySelector("[data-character-count]");
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

const setLoading = (form, isLoading) => {
  const button = form.querySelector(".conversion-submit");
  button?.classList.toggle("is-loading", isLoading);
  if (button) button.disabled = isLoading;
};

const getFormData = (form) => {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
};

const getCheckedValues = (form, name) => (
  Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value)
);

const submitLeadRequest = async (payload) => {
  window.efficiaLeadPayload = payload;
  // Future integrations can be connected here: Brevo, Tally, Google Sheets, Make or n8n.
  return payload;
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
  if (event.target === messageTextarea && characterCount) {
    characterCount.textContent = String(messageTextarea.value.length);
  }
});

modal?.addEventListener("blur", (event) => {
  if (event.target.matches("input:not([type='radio'])")) validateField(event.target);
}, true);

stepOneForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateForm(stepOneForm)) return;

  setLoading(stepOneForm, true);
  window.setTimeout(() => {
    leadDraft = getFormData(stepOneForm);
    setLoading(stepOneForm, false);
    showStep(2);
    focusFirstField();
  }, 650);
});

stepTwoForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateForm(stepTwoForm)) return;

  setLoading(stepTwoForm, true);
  window.setTimeout(() => {
    const payload = {
      ...leadDraft,
      ...getFormData(stepTwoForm),
      problems: getCheckedValues(stepTwoForm, "problems"),
      source: "score-efficia-modal",
      submittedAt: new Date().toISOString(),
    };
    submitLeadRequest(payload);
    setLoading(stepTwoForm, false);
    showStep(3);
    confirmationStep?.querySelector("button")?.focus({ preventScroll: true });
  }, 650);
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
