(() => {
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('.site-nav');
  const toast = document.querySelector('.site-toast');
  const closeMenu = () => {
    nav?.classList.remove('open');
    menu?.setAttribute('aria-expanded', 'false');
  };
  menu?.addEventListener('click', () => {
    const open = !nav?.classList.contains('open');
    nav?.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.querySelector('.checkout-button')?.addEventListener('click', () => {
    if (!toast) return;
    toast.textContent = 'JamBeacon is live. Secure $9.99 checkout is the next connection.';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3200);
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
})();
