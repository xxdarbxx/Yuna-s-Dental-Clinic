import { supabase, requireSession } from '../../shared/supabase-client.js';
import { initAdminNav } from './nav.js';
import { escapeHtml, formatDate, formatTime, showToast, openModal, closeModal, initModalDismiss, statusLabel, patientFullName } from '../../shared/ui.js';

const session = await requireSession();
let view = 'month';
let anchorDate = new Date();
anchorDate.setHours(0, 0, 0, 0);
let patients = [];
let rangeAppointments = [];
let pendingRequests = [];

if (session) {
  initAdminNav(session.profile);
  initModalDismiss();
  await loadPatientsDropdown();
  wireToolbar();
  wireForm();
  await loadPendingRequests();
  await refresh();

  if (new URLSearchParams(window.location.search).get('new')) {
    openApptModal();
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const toISODate = (d) => d.toISOString().slice(0, 10);

function statusBadgeClass(status) {
  const map = {
    requested: 'badge--gray', scheduled: 'badge--blue', confirmed: 'badge--blue',
    checked_in: 'badge--amber', waiting: 'badge--amber', in_progress: 'badge--amber',
    completed: 'badge--green', cancelled: 'badge--red', no_show: 'badge--red',
  };
  return map[status] || 'badge--gray';
}

async function loadPatientsDropdown() {
  const { data } = await supabase.from('patients').select('id, first_name, last_name').order('first_name');
  patients = data || [];
  const select = document.getElementById('apptPatient');
  patients.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = patientFullName(p);
    select.appendChild(opt);
  });
}

function wireToolbar() {
  document.getElementById('prevBtn').addEventListener('click', () => navigate(-1));
  document.getElementById('nextBtn').addEventListener('click', () => navigate(1));
  document.getElementById('todayBtn').addEventListener('click', () => {
    anchorDate = new Date();
    anchorDate.setHours(0, 0, 0, 0);
    refresh();
  });

  document.querySelectorAll('.view-switch button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-switch button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      view = btn.dataset.view;
      refresh();
    });
  });

  document.getElementById('bookBtn').addEventListener('click', () => openApptModal());

  document.getElementById('apptPatient').addEventListener('change', updateGuestFieldsVisibility);
}

function updateGuestFieldsVisibility() {
  const hasPatient = !!document.getElementById('apptPatient').value;
  document.getElementById('guestFields').style.display = hasPatient ? 'none' : 'grid';
}

function navigate(dir) {
  if (view === 'month') anchorDate.setMonth(anchorDate.getMonth() + dir);
  else if (view === 'week') anchorDate.setDate(anchorDate.getDate() + dir * 7);
  else anchorDate.setDate(anchorDate.getDate() + dir);
  refresh();
}

function getRange() {
  if (view === 'month') {
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 41);
    return { start, end };
  }
  if (view === 'week') {
    const start = new Date(anchorDate);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }
  return { start: new Date(anchorDate), end: new Date(anchorDate) };
}

async function refresh() {
  updatePeriodLabel();
  const { start, end } = getRange();

  const { data, error } = await supabase
    .from('appointments')
    .select('id, patient_id, guest_name, guest_phone, appointment_date, start_time, end_time, service_type, status, notes, patients(first_name,last_name)')
    .gte('appointment_date', toISODate(start))
    .lte('appointment_date', toISODate(end))
    .order('start_time', { ascending: true });

  if (error) {
    showToast('Failed to load appointments.', 'error');
    rangeAppointments = [];
  } else {
    rangeAppointments = data || [];
  }

  document.getElementById('monthView').style.display = view === 'month' ? 'block' : 'none';
  document.getElementById('weekView').style.display = view === 'week' ? 'grid' : 'none';
  document.getElementById('dayView').style.display = view === 'day' ? 'flex' : 'none';

  if (view === 'month') renderMonth();
  else if (view === 'week') renderWeek();
  else renderDay();
}

function updatePeriodLabel() {
  const label = document.getElementById('periodLabel');
  if (view === 'month') {
    label.textContent = anchorDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  } else if (view === 'week') {
    const { start, end } = getRange();
    label.textContent = `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`;
  } else {
    label.textContent = anchorDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

function apptName(a) {
  return a.patient_id ? patientFullName(a.patients) : (a.guest_name || 'Guest');
}

function apptsOnDate(dateStr) {
  return rangeAppointments.filter((a) => a.appointment_date === dateStr);
}

async function loadPendingRequests() {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, patient_id, guest_name, appointment_date, start_time, service_type, patients(first_name,last_name)')
    .eq('status', 'requested')
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true });

  pendingRequests = error ? [] : (data || []);
  renderPendingRequests();

  const topLabel = document.getElementById('requestsLabel');
  topLabel.textContent = pendingRequests.length
    ? `${pendingRequests.length} pending request${pendingRequests.length === 1 ? '' : 's'} awaiting review`
    : 'No pending requests';
}

function renderPendingRequests() {
  const panel = document.getElementById('requestsPanel');
  const body = document.getElementById('requestsBody');
  document.getElementById('requestsCount').textContent = pendingRequests.length;

  if (!pendingRequests.length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  body.innerHTML = pendingRequests.map((a) => `
    <tr>
      <td class="cell-strong">${formatDate(a.appointment_date)}</td>
      <td>${formatTime(a.start_time)}</td>
      <td>${escapeHtml(apptName(a))}</td>
      <td>${escapeHtml(a.service_type || '—')}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn--primary btn--sm" data-confirm="${a.id}">Confirm</button>
          <button class="btn btn--outline btn--sm" data-open="${a.id}">Open</button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openApptModal(btn.dataset.open));
  });

  body.querySelectorAll('[data-confirm]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await supabase.from('appointments').update({ status: 'scheduled' }).eq('id', btn.dataset.confirm);
      if (error) {
        showToast('Could not confirm this request.', 'error');
        btn.disabled = false;
        return;
      }
      showToast('Appointment confirmed.');
      await loadPendingRequests();
      await refresh();
    });
  });
}

function renderMonth() {
  const container = document.getElementById('monthView');
  const { start } = getRange();
  const todayStr = toISODate(new Date());

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = '<div class="month-grid">';
  weekdays.forEach((w) => (html += `<div class="weekday">${w}</div>`));

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = toISODate(d);
    const inMonth = d.getMonth() === anchorDate.getMonth();
    const dayAppts = apptsOnDate(dateStr);
    const classes = ['month-cell'];
    if (!inMonth) classes.push('other-month');
    if (dateStr === todayStr) classes.push('today');

    const chips = dayAppts.slice(0, 3).map((a) =>
      `<div class="appt-chip" data-id="${a.id}">${formatTime(a.start_time)} ${escapeHtml(apptName(a))}</div>`
    ).join('');
    const more = dayAppts.length > 3 ? `<div class="more-chip">+${dayAppts.length - 3} more</div>` : '';

    html += `<div class="${classes.join(' ')}" data-date="${dateStr}">
      <span class="date-num">${d.getDate()}</span>
      ${chips}${more}
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.appt-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openApptModal(chip.dataset.id);
    });
  });

  container.querySelectorAll('.month-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      anchorDate = new Date(cell.dataset.date + 'T00:00:00');
      view = 'day';
      document.querySelectorAll('.view-switch button').forEach((b) => b.classList.toggle('active', b.dataset.view === 'day'));
      refresh();
    });
  });
}

function renderWeek() {
  const container = document.getElementById('weekView');
  const { start } = getRange();
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = toISODate(d);
    const dayAppts = apptsOnDate(dateStr);
    html += `<div class="week-col">
      <h4>${d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' })}</h4>
      ${dayAppts.map((a) => `<div class="appt-chip" data-id="${a.id}">${formatTime(a.start_time)}<br>${escapeHtml(apptName(a))}</div>`).join('') || '<p class="text-muted" style="font-size:0.75rem; text-align:center;">—</p>'}
    </div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.appt-chip').forEach((chip) => {
    chip.addEventListener('click', () => openApptModal(chip.dataset.id));
  });
}

function renderDay() {
  const container = document.getElementById('dayView');
  const dateStr = toISODate(anchorDate);
  const dayAppts = apptsOnDate(dateStr);

  if (!dayAppts.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>No appointments on this day.</p></div>`;
    return;
  }

  container.innerHTML = dayAppts.map((a) => `
    <div class="day-slot" data-id="${a.id}" style="cursor:pointer;">
      <div class="time-col">${formatTime(a.start_time)}${a.end_time ? ' – ' + formatTime(a.end_time) : ''}</div>
      <div class="info-col">
        <strong>${escapeHtml(apptName(a))}</strong>
        <span>${escapeHtml(a.service_type || '—')}${a.notes ? ' • ' + escapeHtml(a.notes) : ''}</span>
      </div>
      <span class="badge ${statusBadgeClass(a.status)}">${statusLabel(a.status)}</span>
    </div>
  `).join('');

  container.querySelectorAll('.day-slot').forEach((slot) => {
    slot.addEventListener('click', () => openApptModal(slot.dataset.id));
  });
}

function openApptModal(id) {
  const form = document.getElementById('apptForm');
  form.reset();
  document.getElementById('apptError').classList.remove('show');
  document.getElementById('apptId').value = id || '';
  document.getElementById('apptDeleteBtn').style.display = id ? 'inline-flex' : 'none';

  if (id) {
    const a = rangeAppointments.find((x) => x.id === id);
    document.getElementById('apptModalTitle').textContent = 'Edit Appointment';
    if (a) {
      document.getElementById('apptPatient').value = a.patient_id || '';
      document.getElementById('guestName').value = a.guest_name || '';
      document.getElementById('guestPhone').value = a.guest_phone || '';
      document.getElementById('apptDate').value = a.appointment_date;
      document.getElementById('apptStart').value = a.start_time?.slice(0, 5) || '';
      document.getElementById('apptEnd').value = a.end_time?.slice(0, 5) || '';
      document.getElementById('apptService').value = a.service_type || '';
      document.getElementById('apptStatus').value = a.status;
      document.getElementById('apptNotes').value = a.notes || '';
    } else {
      // Not in current range cache — fetch directly.
      fetchSingleAppt(id);
    }
  } else {
    document.getElementById('apptModalTitle').textContent = 'Book Appointment';
    document.getElementById('apptDate').value = toISODate(anchorDate);
    document.getElementById('apptStatus').value = 'scheduled';
  }

  updateGuestFieldsVisibility();
  openModal('apptModal');
}

async function fetchSingleAppt(id) {
  const { data } = await supabase.from('appointments').select('*').eq('id', id).single();
  if (!data) return;
  document.getElementById('apptPatient').value = data.patient_id || '';
  document.getElementById('guestName').value = data.guest_name || '';
  document.getElementById('guestPhone').value = data.guest_phone || '';
  document.getElementById('apptDate').value = data.appointment_date;
  document.getElementById('apptStart').value = data.start_time?.slice(0, 5) || '';
  document.getElementById('apptEnd').value = data.end_time?.slice(0, 5) || '';
  document.getElementById('apptService').value = data.service_type || '';
  document.getElementById('apptStatus').value = data.status;
  document.getElementById('apptNotes').value = data.notes || '';
  updateGuestFieldsVisibility();
}

function wireForm() {
  document.getElementById('apptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('apptError');
    const saveBtn = document.getElementById('apptSaveBtn');
    errorBox.classList.remove('show');
    saveBtn.disabled = true;

    const id = document.getElementById('apptId').value;
    const patientId = document.getElementById('apptPatient').value || null;

    const payload = {
      patient_id: patientId,
      guest_name: patientId ? null : (document.getElementById('guestName').value.trim() || null),
      guest_phone: patientId ? null : (document.getElementById('guestPhone').value.trim() || null),
      appointment_date: document.getElementById('apptDate').value,
      start_time: document.getElementById('apptStart').value,
      end_time: document.getElementById('apptEnd').value || null,
      service_type: document.getElementById('apptService').value,
      status: document.getElementById('apptStatus').value,
      notes: document.getElementById('apptNotes').value.trim() || null,
    };

    const { error } = id
      ? await supabase.from('appointments').update(payload).eq('id', id)
      : await supabase.from('appointments').insert(payload);

    saveBtn.disabled = false;

    if (error) {
      errorBox.textContent = 'Could not save appointment. Please check the fields and try again.';
      errorBox.classList.add('show');
      return;
    }

    showToast(id ? 'Appointment updated.' : 'Appointment booked.');
    closeModal('apptModal');
    await loadPendingRequests();
    await refresh();
  });

  document.getElementById('apptDeleteBtn').addEventListener('click', async () => {
    const id = document.getElementById('apptId').value;
    if (!id || !confirm('Delete this appointment? This cannot be undone.')) return;
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) {
      showToast('Could not delete appointment.', 'error');
      return;
    }
    showToast('Appointment deleted.');
    closeModal('apptModal');
    await loadPendingRequests();
    await refresh();
  });
}
