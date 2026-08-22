(() => {
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('.site-nav');
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
})();
