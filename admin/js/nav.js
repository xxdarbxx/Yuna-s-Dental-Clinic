// Shared admin layout behavior: user info, role-gating, mobile sidebar toggle, sign out.
import { signOut } from '../../shared/supabase-client.js';

export function initAdminNav(profile) {
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRoleLabel');
  const avatarEl = document.getElementById('userAvatar');

  if (nameEl) nameEl.textContent = profile.full_name || 'Staff';
  if (roleEl) roleEl.textContent = profile.role || 'staff';
  if (avatarEl) {
    const initials = (profile.full_name || 'S')
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    avatarEl.textContent = initials;
  }

  if (profile.role !== 'admin') {
    document.querySelectorAll('[data-admin-only]').forEach((el) => el.remove());
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => signOut());
  }

  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
  }

  document.querySelectorAll('.sidebar__nav a').forEach((link) => {
    link.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
  });
}
