import { supabase, requireSession } from '../../shared/supabase-client.js';
import { initAdminNav } from './nav.js';
import { escapeHtml, formatCurrency, formatTime, statusLabel, patientFullName } from '../../shared/ui.js';

const session = await requireSession();
if (session) {
  initAdminNav(session.profile);
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  loadDashboard();
}

function statusBadgeClass(status) {
  const map = {
    requested: 'badge--gray', scheduled: 'badge--blue', confirmed: 'badge--blue',
    checked_in: 'badge--amber', waiting: 'badge--amber', in_progress: 'badge--amber',
    completed: 'badge--green', cancelled: 'badge--red', no_show: 'badge--red',
  };
  return map[status] || 'badge--gray';
}

async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const [
    patientsCount,
    todayAppts,
    upcomingCount,
    completedCount,
    cancelledCount,
    requestsCount,
    monthPayments,
    openInvoices,
  ] = await Promise.all([
    supabase.from('patients').select('id', { count: 'exact', head: true }),
    supabase.from('appointments')
      .select('id, start_time, service_type, status, patient_id, guest_name, patients(first_name,last_name)')
      .eq('appointment_date', today)
      .order('start_time', { ascending: true }),
    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .gt('appointment_date', today).in('status', ['scheduled', 'confirmed']),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('payments').select('amount').gte('paid_at', monthStart),
    supabase.from('invoices').select('balance').gt('balance', 0),
  ]);

  document.getElementById('statPatients').textContent = patientsCount.count ?? 0;
  document.getElementById('statToday').textContent = todayAppts.data?.length ?? 0;
  document.getElementById('statUpcoming').textContent = upcomingCount.count ?? 0;
  document.getElementById('statCompleted').textContent = completedCount.count ?? 0;
  document.getElementById('statCancelled').textContent = cancelledCount.count ?? 0;
  document.getElementById('statRequests').textContent = requestsCount.count ?? 0;

  const monthRevenue = (monthPayments.data || []).reduce((sum, p) => sum + Number(p.amount), 0);
  document.getElementById('statRevenue').textContent = formatCurrency(monthRevenue);

  const outstanding = (openInvoices.data || []).reduce((sum, i) => sum + Number(i.balance), 0);
  document.getElementById('statOutstanding').textContent = formatCurrency(outstanding);

  renderTodaySchedule(todayAppts.data || []);
  loadActivity();
}

function renderTodaySchedule(rows) {
  const body = document.getElementById('todayBody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:24px;">No appointments scheduled for today.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r) => {
    const name = r.patient_id ? patientFullName(r.patients) : (r.guest_name || 'Guest');
    return `
      <tr>
        <td class="cell-strong">${formatTime(r.start_time)}</td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(r.service_type || '—')}</td>
        <td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td>
      </tr>`;
  }).join('');
}

async function loadActivity() {
  const list = document.getElementById('activityList');

  const [patients, appts, payments] = await Promise.all([
    supabase.from('patients').select('id, first_name, last_name, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('appointments').select('id, service_type, status, guest_name, patient_id, created_at, patients(first_name,last_name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('payments').select('id, amount, paid_at').order('paid_at', { ascending: false }).limit(5),
  ]);

  const items = [];

  (patients.data || []).forEach((p) => items.push({
    icon: '👤',
    text: `New patient added: <strong>${escapeHtml(patientFullName(p))}</strong>`,
    at: p.created_at,
  }));

  (appts.data || []).forEach((a) => {
    const name = a.patient_id ? patientFullName(a.patients) : (a.guest_name || 'Guest');
    items.push({
      icon: '📅',
      text: `Appointment ${escapeHtml(statusLabel(a.status).toLowerCase())} for <strong>${escapeHtml(name)}</strong>${a.service_type ? ` — ${escapeHtml(a.service_type)}` : ''}`,
      at: a.created_at,
    });
  });

  (payments.data || []).forEach((pay) => items.push({
    icon: '💰',
    text: `Payment of <strong>${formatCurrency(pay.amount)}</strong> recorded`,
    at: pay.paid_at,
  }));

  items.sort((a, b) => new Date(b.at) - new Date(a.at));

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🗂️</div><p>No recent activity yet.</p></div>`;
    return;
  }

  list.innerHTML = items.slice(0, 8).map((item) => `
    <div class="activity-item">
      <div class="dot">${item.icon}</div>
      <div>
        <div class="title">${item.text}</div>
        <div class="time">${new Date(item.at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      </div>
    </div>
  `).join('');
}
