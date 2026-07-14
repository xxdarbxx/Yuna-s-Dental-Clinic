import { supabase, requireSession } from '../../shared/supabase-client.js';
import { initAdminNav } from './nav.js';
import { escapeHtml, formatDate, showToast, openModal, closeModal, initModalDismiss } from '../../shared/ui.js';

const session = await requireSession();
let allPatients = [];

if (session) {
  initAdminNav(session.profile);
  initModalDismiss();
  await loadPatients();
  wireForm();

  if (new URLSearchParams(window.location.search).get('new')) {
    openAddModal();
  }
}

function age(dob) {
  if (!dob) return '—';
  const b = new Date(dob);
  const diff = Date.now() - b.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

async function loadPatients() {
  const { data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name, phone, email, date_of_birth, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    showToast('Failed to load patients.', 'error');
    return;
  }
  allPatients = data || [];
  document.getElementById('countLabel').textContent = `${allPatients.length} patient${allPatients.length === 1 ? '' : 's'}`;
  renderTable(allPatients);

  document.getElementById('searchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return renderTable(allPatients);
    renderTable(allPatients.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    ));
  });
}

function renderTable(rows) {
  const body = document.getElementById('patientsBody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No patients found.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((p) => `
    <tr class="clickable" data-id="${p.id}">
      <td class="cell-strong">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</td>
      <td>${escapeHtml(p.phone || '—')}</td>
      <td>${escapeHtml(p.email || '—')}</td>
      <td>${age(p.date_of_birth)}</td>
      <td class="cell-sub">${formatDate(p.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn--icon btn--sm" data-edit="${p.id}" title="Edit">✏️</button>
          <button class="btn btn--icon btn--sm" data-admin-only data-delete="${p.id}" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.location.href = `patient-profile.html?id=${row.dataset.id}`;
    });
  });

  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.edit);
    });
  });

  body.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this patient? This cannot be undone.')) return;
      const { error } = await supabase.from('patients').delete().eq('id', btn.dataset.delete);
      if (error) {
        showToast('Could not delete patient.', 'error');
        return;
      }
      showToast('Patient deleted.');
      await loadPatients();
    });
  });

  if (session.profile.role !== 'admin') {
    body.querySelectorAll('[data-admin-only]').forEach((el) => el.remove());
  }
}

function openAddModal() {
  document.getElementById('patientModalTitle').textContent = 'Add Patient';
  document.getElementById('patientForm').reset();
  document.getElementById('patientId').value = '';
  document.getElementById('patientError').classList.remove('show');
  openModal('patientModal');
}

function openEditModal(id) {
  const p = allPatients.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('patientModalTitle').textContent = 'Edit Patient';
  document.getElementById('patientId').value = p.id;
  document.getElementById('firstName').value = p.first_name || '';
  document.getElementById('lastName').value = p.last_name || '';
  document.getElementById('dob').value = p.date_of_birth || '';
  document.getElementById('phone').value = p.phone || '';
  document.getElementById('email').value = p.email || '';
  document.getElementById('patientError').classList.remove('show');
  openModal('patientModal');
}

function wireForm() {
  document.getElementById('addPatientBtn').addEventListener('click', openAddModal);

  document.getElementById('patientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('patientError');
    const saveBtn = document.getElementById('patientSaveBtn');
    errorBox.classList.remove('show');
    saveBtn.disabled = true;

    const id = document.getElementById('patientId').value;
    const payload = {
      first_name: document.getElementById('firstName').value.trim(),
      last_name: document.getElementById('lastName').value.trim(),
      date_of_birth: document.getElementById('dob').value || null,
      gender: document.getElementById('gender').value || null,
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim() || null,
      address: document.getElementById('address').value.trim() || null,
    };

    const { error } = id
      ? await supabase.from('patients').update(payload).eq('id', id)
      : await supabase.from('patients').insert(payload);

    saveBtn.disabled = false;

    if (error) {
      errorBox.textContent = 'Could not save patient. Please check the fields and try again.';
      errorBox.classList.add('show');
      return;
    }

    showToast(id ? 'Patient updated.' : 'Patient added.');
    closeModal('patientModal');
    await loadPatients();
  });
}
