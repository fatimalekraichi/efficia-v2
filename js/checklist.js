(() => {
  'use strict';
  const ERROR = 'Une erreur est survenue. Merci de réessayer dans quelques instants.';
  // One form template shared by every checklist mount; fallback remains in HTML.
  document.querySelectorAll('[data-checklist]').forEach((mount, index) => {
    const prefix = `checklist-${index}`;
    const form = document.createElement('form');
    form.className = 'site-form checklist-form';
    form.action = '/api/checklist';
    form.method = 'post';
    form.setAttribute('data-clarity-mask', 'true');
    form.innerHTML = `
      <div class="conversion-fields">
        <label for="${prefix}-name"><span>Prénom</span></label>
        <input id="${prefix}-name" name="firstName" required maxlength="80" autocomplete="given-name">
        <label for="${prefix}-email"><span>Adresse e-mail</span></label>
        <input id="${prefix}-email" name="email" type="email" required maxlength="254" autocomplete="email">
      </div>
      <div class="site-honeypot" aria-hidden="true"><label>Ne pas remplir<input name="company_url" tabindex="-1" autocomplete="off"></label></div>
      <div class="checklist-consent"><input id="${prefix}-consent" name="consent" type="checkbox" required>
        <label for="${prefix}-consent">J'accepte de recevoir la checklist par e-mail, ainsi que quelques conseils d'Efficia Digital. Désinscription en un clic.</label>
      </div>
      <p class="site-privacy"><a href="/politique-confidentialite">Politique de confidentialité</a></p>
      <button class="btn btn-primary" type="submit">Recevoir la checklist</button>
      <div class="site-form-status" role="status" aria-live="polite" tabindex="-1"></div>`;
    mount.appendChild(form);
    const status = form.querySelector('.site-form-status');
    const button = form.querySelector('button');
    let busy = false;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true;
      button.disabled = true;
      button.textContent = 'Envoi en cours…';
      form.setAttribute('aria-busy', 'true');
      status.textContent = 'Votre demande est en cours d’envoi.';
      status.dataset.state = 'sending';
      const fields = form.elements;
      try {
        const response = await fetch('/api/checklist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: fields.namedItem('firstName').value,
            email: fields.namedItem('email').value, consent: fields.namedItem('consent').checked,
            company_url: fields.namedItem('company_url').value }),
          signal: AbortSignal.timeout(25000),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.success !== true) throw new Error(ERROR);
        status.textContent = "C'est envoyé. Vérifiez votre boîte de réception (et vos indésirables). Vous pouvez aussi la télécharger tout de suite : ";
        const link = document.createElement('a');
        link.href = '/assets/documents/votre-site-en-10-points.pdf';
        link.textContent = 'Télécharger la checklist « Votre site en 10 points »';
        link.setAttribute('download', '');
        status.appendChild(link);
        status.dataset.state = 'success';
        window.efficiaGA4?.trackChecklistSignup();
        form.reset();
      } catch {
        status.textContent = ERROR;
        status.dataset.state = 'error';
      } finally {
        busy = false;
        button.disabled = false;
        button.textContent = 'Recevoir la checklist';
        form.removeAttribute('aria-busy');
        status.focus();
      }
    });
  });
})();
