import { supabase, requireSession } from '../../shared/supabase-client.js';
import { initAdminNav } from './nav.js';
import { escapeHtml, formatDate, formatCurrency, showToast, openModal, closeModal, initModalDismiss, statusLabel, patientFullName } from '../../shared/ui.js';

const UPPER_ARCH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_ARCH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const session = await requireSession();
let plans = [];
let selectedTeeth = new Set();
let currentPatientId = '';

if (session) {
  initAdminNav(session.profile);
  initModalDismiss();
  buildToothChart();
  await loadPatientsDropdown();
  wireEvents();

  const params = new URLSearchParams(window.location.search);
  const presetPatient = params.get('patient');
  if (presetPatient) {
    document.getElementById('patientSelect').value = presetPatient;
    await selectPatient(presetPatient);
    if (params.get('new')) openPlanModal();
  }
}

function statusBadgeClass(status) {
  const map = { planned: 'badge--amber', in_progress: 'badge--blue', completed: 'badge--green' };
  return map[status] || 'badge--gray';
}

async function loadPatientsDropdown() {
  const { data } = await supabase.from('patients').select('id, first_name, last_name').order('first_name');
  const select = document.getElementById('patientSelect');
  (data || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = patientFullName(p);
    select.appendChild(opt);
  });
}

function buildToothChart() {
  const upper = document.getElementById('upperArch');
  const lower = document.getElementById('lowerArch');
  upper.innerHTML = UPPER_ARCH.map((n) => `<div class="tooth" data-tooth="${n}">${n}</div>`).join('');
  lower.innerHTML = LOWER_ARCH.map((n) => `<div class="tooth" data-tooth="${n}">${n}</div>`).join('');

  document.querySelectorAll('.tooth').forEach((el) => {
    el.addEventListener('click', () => {
      const n = el.dataset.tooth;
      if (selectedTeeth.has(n)) {
        selectedTeeth.delete(n);
        el.style.outline = '';
      } else {
        selectedTeeth.add(n);
        el.style.outline = '2px solid var(--purple)';
      }
      updateSelectedHint();
    });
  });
}

function updateSelectedHint() {
  const hint = document.getElementById('selectedTeethHint');
  hint.textContent = selectedTeeth.size
    ? `Selected teeth: ${[...selectedTeeth].join(', ')} — click "New Treatment Plan" to record a procedure.`
    : '';
}

function colorTeeth() {
  const toothStatus = {};
  // Later plans (already sorted ascending by created_at) overwrite earlier ones,
  // so each tooth reflects its most recent recorded status.
  plans.forEach((p) => {
    (p.tooth_numbers || '').split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => {
      toothStatus[t] = p.status;
    });
  });

  document.querySelectorAll('.tooth').forEach((el) => {
    el.classList.remove('status-planned', 'status-in_progress', 'status-completed');
    const status = toothStatus[el.dataset.tooth];
    if (status) el.classList.add(`status-${status}`);
  });
}

function wireEvents() {
  document.getElementById('patientSelect').addEventListener('change', (e) => selectPatient(e.target.value));
  document.getElementById('newPlanBtn').addEventListener('click', () => openPlanModal());
  document.getElementById('planForm').addEventListener('submit', savePlan);
  document.getElementById('planDeleteBtn').addEventListener('click', deletePlan);
}

async function selectPatient(id) {
  currentPatientId = id;
  selectedTeeth.clear();
  updateSelectedHint();

  if (!id) {
    document.getElementById('patientEmptyState').style.display = 'block';
    document.getElementById('patientTreatmentArea').style.display = 'none';
    return;
  }

  document.getElementById('patientEmptyState').style.display = 'none';
  document.getElementById('patientTreatmentArea').style.display = 'block';
  await loadPlans();
}

async function loadPlans() {
  const { data, error } = await supabase
    .from('treatment_plans')
    .select('id, procedure, tooth_numbers, status, cost, dentist_notes, date_performed, created_at')
    .eq('patient_id', currentPatientId)
    .order('created_at', { ascending: true });

  plans = error ? [] : (data || []);
  colorTeeth();
  renderPlansTable();
}

function renderPlansTable() {
  const body = document.getElementById('plansBody');
  if (!plans.length) {
    body.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No treatment plans yet.</td></tr>`;
    return;
  }
  const sorted = [...plans].reverse();
  body.innerHTML = sorted.map((p) => `
    <tr>
      <td class="cell-sub">${formatDate(p.date_performed || p.created_at)}</td>
      <td class="cell-strong">${escapeHtml(p.procedure)}</td>
      <td>${escapeHtml(p.tooth_numbers || '—')}</td>
      <td><span class="badge ${statusBadgeClass(p.status)}">${statusLabel(p.status)}</span></td>
      <td style="text-align:right;">${formatCurrency(p.cost)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn--icon btn--sm" data-edit="${p.id}" title="Edit">✏️</button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openPlanModal(btn.dataset.edit));
  });
}

function openPlanModal(id) {
  const form = document.getElementById('planForm');
  form.reset();
  document.getElementById('planError').classList.remove('show');
  document.getElementById('planId').value = id || '';
  document.getElementById('planDeleteBtn').style.display = id ? 'inline-flex' : 'none';

  if (id) {
    const p = plans.find((x) => x.id === id);
    document.getElementById('planModalTitle').textContent = 'Edit Treatment Plan';
    if (p) {
      document.getElementById('planProcedure').value = p.procedure;
      document.getElementById('planTeeth').value = p.tooth_numbers || '';
      document.getElementById('planStatus').value = p.status;
      document.getElementById('planCost').value = p.cost;
      document.getElementById('planDate').value = p.date_performed || '';
      document.getElementById('planNotes').value = p.dentist_notes || '';
    }
  } else {
    document.getElementById('planModalTitle').textContent = 'New Treatment Plan';
    document.getElementById('planTeeth').value = [...selectedTeeth].join(', ');
    document.getElementById('planStatus').value = 'planned';
  }

  openModal('planModal');
}

async function savePlan(e) {
  e.preventDefault();
  const errorBox = document.getElementById('planError');
  const saveBtn = document.getElementById('planSaveBtn');
  errorBox.classList.remove('show');
  saveBtn.disabled = true;

  const id = document.getElementById('planId').value;
  const payload = {
    patient_id: currentPatientId,
    procedure: document.getElementById('planProcedure').value,
    tooth_numbers: document.getElementById('planTeeth').value.trim() || null,
    status: document.getElementById('planStatus').value,
    cost: Number(document.getElementById('planCost').value) || 0,
    date_performed: document.getElementById('planDate').value || null,
    dentist_notes: document.getElementById('planNotes').value.trim() || null,
  };
  if (!id) payload.dentist_id = session.profile.id;

  const { error } = id
    ? await supabase.from('treatment_plans').update(payload).eq('id', id)
    : await supabase.from('treatment_plans').insert(payload);

  saveBtn.disabled = false;

  if (error) {
    errorBox.textContent = 'Could not save treatment plan. Please check the fields and try again.';
    errorBox.classList.add('show');
    return;
  }

  showToast(id ? 'Treatment plan updated.' : 'Treatment plan created.');
  closeModal('planModal');
  selectedTeeth.clear();
  updateSelectedHint();
  await loadPlans();
}

async function deletePlan() {
  const id = document.getElementById('planId').value;
  if (!id || !confirm('Delete this treatment plan? This cannot be undone.')) return;
  const { error } = await supabase.from('treatment_plans').delete().eq('id', id);
  if (error) {
    showToast('Could not delete treatment plan.', 'error');
    return;
  }
  showToast('Treatment plan deleted.');
  closeModal('planModal');
  await loadPlans();
}
