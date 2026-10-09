(() => {
  'use strict';
  const WHATSAPP_URL = 'https://wa.me/32478020842?text=Bonjour%20Efficia%20Digital%2C%20j%E2%80%99aimerais%20avoir%20des%20informations';
  const GBP_URL = "https://www.google.com/maps?cid=1527372809870091257";
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const nav = document.querySelector('.header .nav');
  const whatsapp = (location, icon = false) => {
    const link = document.createElement('a');
    link.href = WHATSAPP_URL;
    link.target = '_blank'; link.rel = 'noopener';
    link.dataset.trackLocation = location;
    link.setAttribute('aria-label', 'Écrire à Efficia Digital sur WhatsApp');
    link.className = 'btn btn-secondary';
    link.innerHTML = `${icon ? '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20.5 3.5A11.9 11.9 0 0 0 1.7 17.8L0 24l6.4-1.7A12 12 0 0 0 20.5 3.5ZM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.8 1 1-3.7-.3-.4A9.8 9.8 0 1 1 12 21.8Zm5.4-7.3c-.3-.1-1.8-.9-2.1-1s-.5-.1-.7.2-.8 1-.9 1.2-.3.2-.6.1a8 8 0 0 1-3.9-3.4c-.3-.5.3-.4.9-1.6.1-.2 0-.4 0-.6L9.2 7c-.2-.6-.5-.5-.7-.5H8c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.6 1.1 3 1.3 3.2 2.2 3.4 5.3 4.7c2 .9 2.8 1 3.8.9.6-.1 1.8-.8 2.1-1.5s.3-1.3.2-1.5-.3-.3-.6-.4Z"/></svg>' : ''}WhatsApp`;
    return link;
  };
  const contact = location => {
    const link = document.createElement('a');
    link.href = '/contact'; link.className = 'btn btn-primary';
    link.textContent = 'Être recontacté'; link.dataset.trackLocation = location;
    return link;
  };
  if (nav) {
    const menu = document.createElement('div'); menu.className = 'mobile-menu-contact';
    menu.append(whatsapp('menu'), contact('menu')); nav.append(menu);
  }
  document.querySelectorAll('a[href]').forEach(link => {
    const url = new URL(link.href, location.origin);
    if (link.textContent.includes('→')) link.classList.add('tap-link');
    const inFooter = Boolean(link.closest('footer'));
    if (url.hostname === 'wa.me') {
      link.href = WHATSAPP_URL;
      link.target = '_blank'; link.rel = 'noopener';
      link.dataset.trackLocation ||= inFooter ? 'footer' : link.closest('header') ? 'header' : 'contact_page';
    }
    if (url.origin === location.origin && /^\/contact(?:\.html)?\/?$/.test(url.pathname)) {
      link.dataset.trackLocation ||= inFooter ? 'footer' : link.closest('.header-btn') ? 'header' : link.closest('.nav') ? 'menu' : link.closest('.page-final') ? 'final_cta' : link.closest('.process-section') ? 'process' : 'hero';
    }
  });
  if (GBP_URL) {
    document.querySelectorAll('[data-gbp-link]').forEach(link => { link.href = GBP_URL; link.hidden = false; });
  }
  if (path === '/contact') return;
  const bar = document.createElement('aside'); bar.className = 'mobile-contact-bar';
  bar.setAttribute('aria-label', 'Contacter Efficia Digital');
  bar.setAttribute('inert', ''); bar.setAttribute('aria-hidden', 'true');
  bar.append(whatsapp('sticky_bar', true), contact('sticky_bar'));
  document.body.append(bar); document.body.classList.add('has-mobile-contact');
  const update = () => {
    const blocked = document.querySelector('.cookie-consent.is-visible, .cookie-preferences.is-open, .nav[data-menu-open="true"]');
    const show = innerWidth < 768 && scrollY > 300 && !blocked;
    bar.classList.toggle('is-visible', show);
    bar.toggleAttribute('inert', !show); bar.setAttribute('aria-hidden', String(!show));
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  const observer = new MutationObserver(update);
  document.querySelectorAll('.cookie-consent, .cookie-preferences, .header .nav').forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['class', 'data-menu-open'] }));
  update();
})();
