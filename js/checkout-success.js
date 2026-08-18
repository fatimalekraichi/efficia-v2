(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id") || "";
  const card = document.querySelector("[data-checkout-success]");
  const title = document.querySelector("[data-checkout-success-title]");
  const message = document.querySelector("[data-checkout-success-message]");
  const icon = document.querySelector("[data-checkout-success-icon]");

  if (params.has("session_id")) {
    params.delete("session_id");
    const cleanQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", cleanUrl);
  }

  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

  const setState = (state) => {
    if (!card || !title || !message || !icon) return;
    card.dataset.state = state;
    if (state === "confirmed") {
      icon.textContent = "✓";
      title.textContent = "Merci, votre paiement a bien été confirmé.";
      message.textContent = "Nous avons bien reçu votre commande. Vous recevrez prochainement un e-mail avec les prochaines étapes.";
      return;
    }
    icon.textContent = "…";
    title.textContent = "Votre paiement est en cours de vérification.";
    message.textContent = "La confirmation peut prendre quelques instants. Votre commande sera traitée dès que Stripe l’aura confirmée.";
  };

  const verifyCheckout = async () => {
    if (!sessionId) {
      setState("pending");
      return;
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const response = await fetch("/api/checkout-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success && data.confirmed && data.offer) {
          setState("confirmed");
          document.body.dataset.checkoutConfirmedOffer = data.offer;
          document.dispatchEvent(new CustomEvent("efficia:checkout-confirmed", {
            detail: { offer: data.offer },
          }));
          return;
        }
      } catch {
        // La page reste utilisable si la vérification réseau est momentanément indisponible.
      }
      if (attempt < 5) await wait(800);
    }

    setState("pending");
  };

  verifyCheckout();
})();
