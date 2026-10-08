import { validateSiteRequest } from './site-request-validation.js?v=20261008';
const form = document.querySelector('#contact-request');
const status = form.querySelector('.site-form-status');
const button = form.querySelector('button[type="submit"]');
const LABEL = 'Envoyer ma demande';
const SUCCESS = 'Merci, votre demande est bien arrivée. Vous recevrez une réponse personnelle sous 48 h ouvrées, par e-mail ou WhatsApp. Pensez à vérifier vos courriers indésirables si vous attendez un e-mail.';
const topic = new URLSearchParams(location.search).get('sujet');
if (topic && form.elements.topic.querySelector(`option[value="${CSS.escape(topic)}"]`)) form.elements.topic.value = topic;
let requestId = crypto.randomUUID();
let lastPayload = '';
let busy = false;
const show = (text, state) => { status.textContent = text; status.dataset.state = state; };
form.addEventListener('input', event => { event.target.setCustomValidity?.(''); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const input = Object.fromEntries(new FormData(form));
  const checked = validateSiteRequest(input);
  if (checked.error) {
    const field = form.elements.namedItem(checked.field);
    field.setCustomValidity(checked.error); field.reportValidity();
    return;
  }
  const fingerprint = JSON.stringify(checked.data);
  if (lastPayload && lastPayload !== fingerprint) requestId = crypto.randomUUID();
  lastPayload = fingerprint;
  busy = true; button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  button.textContent = 'Envoi en cours…';
  show('Votre demande est en cours d’envoi.', 'sending');
  try {
    const response = await fetch(form.action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...checked.data, company_url: input.company_url, requestId }),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true || result?.status !== 'sent' || result?.requestId !== requestId) {
      throw new Error(result?.error || 'L’envoi n’a pas pu être confirmé. Vos champs sont conservés. Vous pouvez nous contacter par e-mail ou WhatsApp.');
    }
    show(SUCCESS, 'success');
    window.efficiaGA4?.trackFormSuccess('contact', requestId, input.topic || '');
    form.reset(); lastPayload = ''; requestId = crypto.randomUUID();
  } catch (error) {
    show(error.name === 'TimeoutError' || error instanceof TypeError
      ? 'L’envoi n’a pas pu être confirmé. Vos champs sont conservés. Vérifiez votre connexion ou contactez-nous par e-mail ou WhatsApp.'
      : error.message, 'error');
  } finally {
    busy = false; button.disabled = false; button.textContent = LABEL;
    form.removeAttribute('aria-busy'); status.focus();
  }
});
