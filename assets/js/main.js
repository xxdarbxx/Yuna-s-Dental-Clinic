// Yuna's Dental Clinic — shared public-site behavior (nav toggle, active link).
(function () {
  const toggle = document.querySelector('.nav__toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      document.body.classList.toggle('nav-open');
    });
  }

  document.querySelectorAll('.nav__links a, .nav-mobile-links a').forEach((link) => {
    const href = link.getAttribute('href');
    const current = window.location.pathname.split('/').pop() || 'index.html';
    if (href === current || (current === '' && href === 'index.html')) {
      link.classList.add('active');
    }
    link.addEventListener('click', () => document.body.classList.remove('nav-open'));
  });

  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
})();
