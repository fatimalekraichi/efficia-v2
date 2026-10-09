(() => {
  const nav = document.querySelector('.header .nav');
  if (!nav) return;
  nav.id ||= 'site-navigation';
  nav.setAttribute('aria-label', 'Navigation principale');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-menu-toggle';
  button.textContent = 'Menu';
  button.setAttribute('aria-controls', nav.id);
  button.setAttribute('aria-expanded', 'false');
  nav.before(button);
  const close = () => {
    nav.dataset.menuOpen = 'false';
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    nav.dataset.menuOpen = String(open);
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      close(); button.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.header')) close();
  });
  window.matchMedia('(min-width: 768px)').addEventListener('change', close);
})();
