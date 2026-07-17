const form = document.querySelector("[data-admin-login-form]");
const submit = document.querySelector("[data-admin-login-submit]");
const error = document.querySelector("[data-admin-login-error]");

const setError = (message) => {
  if (error) error.textContent = message;
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");

  const password = new FormData(form).get("password");
  if (!password) {
    setError("Renseignez le mot de passe.");
    return;
  }

  if (submit) {
    submit.disabled = true;
    submit.textContent = "Connexion...";
  }

  try {
    const response = await fetch("/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      throw new Error("Connexion refusée.");
    }

    window.location.href = "/admin";
  } catch {
    setError("Mot de passe incorrect ou configuration admin manquante.");
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Se connecter";
    }
  }
});

