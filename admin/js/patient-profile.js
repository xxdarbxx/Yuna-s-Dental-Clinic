import { supabase, requireSession } from '../../shared/supabase-client.js';
import { initAdminNav } from './nav.js';
import { escapeHtml, formatDate, formatCurrency, showToast, statusLabel } from '../../shared/ui.js';

const params = new URLSearchParams(window.location.search);
const patientId = params.get('id');

if (!patientId) {
  window.location.href = 'patients.html';
}

const session = await requireSession();
let patient = null;

if (session) {
  initAdminNav(session.profile);
  wireTabs();
  wireForms();
  await loadPatient();
  await loadTreatments();
  await loadDocuments();
  wireUpload();
}

function statusBadgeClass(status) {
  const map = { planned: 'badge--amber', in_progress: 'badge--blue', completed: 'badge--green' };
  return map[status] || 'badge--gray';
}

async function loadPatient() {
  const { data, error } = await supabase.from('patients').select('*').eq('id', patientId).single();
  if (error || !data) {
    showToast('Patient not found.', 'error');
    setTimeout(() => (window.location.href = 'patients.html'), 1200);
    return;
  }
  patient = data;

  document.getElementById('loadingPanel').style.display = 'none';
  document.getElementById('profileContent').style.display = 'block';

  document.getElementById('patientName').textContent = `${patient.first_name} ${patient.last_name}`;
  document.getElementById('patientAvatar').textContent = `${(patient.first_name || '?')[0]}${(patient.last_name || '?')[0]}`.toUpperCase();
  document.getElementById('patientMeta').textContent = [patient.phone, patient.email].filter(Boolean).join(' • ') || 'No contact info on file';
  document.getElementById('newTreatmentLink').href = `treatments.html?patient=${patientId}&new=1`;

  document.getElementById('firstName').value = patient.first_name || '';
  document.getElementById('lastName').value = patient.last_name || '';
  document.getElementById('dob').value = patient.date_of_birth || '';
  document.getElementById('gender').value = patient.gender || '';
  document.getElementById('bloodType').value = patient.blood_type || '';
  document.getElementById('phone').value = patient.phone || '';
  document.getElementById('email').value = patient.email || '';
  document.getElementById('address').value = patient.address || '';
  document.getElementById('ecName').value = patient.emergency_contact_name || '';
  document.getElementById('ecPhone').value = patient.emergency_contact_phone || '';
  document.getElementById('ecRelationship').value = patient.emergency_contact_relationship || '';

  document.getElementById('allergies').value = patient.allergies || '';
  document.getElementById('medicalHistory').value = patient.medical_history || '';
  document.getElementById('dentalHistory').value = patient.dental_history || '';

  document.getElementById('notes').value = patient.notes || '';
}

function wireTabs() {
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function wireForms() {
  document.getElementById('overviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('overviewError');
    errorBox.classList.remove('show');

    const { error } = await supabase.from('patients').update({
      first_name: document.getElementById('firstName').value.trim(),
      last_name: document.getElementById('lastName').value.trim(),
      date_of_birth: document.getElementById('dob').value || null,
      gender: document.getElementById('gender').value || null,
      blood_type: document.getElementById('bloodType').value.trim() || null,
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim() || null,
      address: document.getElementById('address').value.trim() || null,
      emergency_contact_name: document.getElementById('ecName').value.trim() || null,
      emergency_contact_phone: document.getElementById('ecPhone').value.trim() || null,
      emergency_contact_relationship: document.getElementById('ecRelationship').value.trim() || null,
    }).eq('id', patientId);

    if (error) {
      errorBox.textContent = 'Could not save changes.';
      errorBox.classList.add('show');
      return;
    }
    showToast('Contact information updated.');
    await loadPatient();
  });

  document.getElementById('medicalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('medicalError');
    errorBox.classList.remove('show');

    const { error } = await supabase.from('patients').update({
      allergies: document.getElementById('allergies').value.trim() || null,
      medical_history: document.getElementById('medicalHistory').value.trim() || null,
      dental_history: document.getElementById('dentalHistory').value.trim() || null,
    }).eq('id', patientId);

    if (error) {
      errorBox.textContent = 'Could not save changes.';
      errorBox.classList.add('show');
      return;
    }
    showToast('Medical & dental history updated.');
  });

  document.getElementById('notesForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('notesError');
    errorBox.classList.remove('show');

    const { error } = await supabase.from('patients').update({
      notes: document.getElementById('notes').value.trim() || null,
    }).eq('id', patientId);

    if (error) {
      errorBox.textContent = 'Could not save notes.';
      errorBox.classList.add('show');
      return;
    }
    showToast('Notes saved.');
  });
}

async function loadTreatments() {
  const body = document.getElementById('treatmentsBody');
  const { data, error } = await supabase
    .from('treatment_plans')
    .select('id, procedure, tooth_numbers, status, cost, date_performed, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error || !data || !data.length) {
    body.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:24px;">No treatments recorded yet.</td></tr>`;
    return;
  }

  body.innerHTML = data.map((t) => `
    <tr>
      <td class="cell-sub">${formatDate(t.date_performed || t.created_at)}</td>
      <td class="cell-strong">${escapeHtml(t.procedure)}</td>
      <td>${escapeHtml(t.tooth_numbers || '—')}</td>
      <td><span class="badge ${statusBadgeClass(t.status)}">${statusLabel(t.status)}</span></td>
      <td style="text-align:right;">${formatCurrency(t.cost)}</td>
    </tr>
  `).join('');
}

async function loadDocuments() {
  const list = document.getElementById('docList');
  const { data, error } = await supabase
    .from('patient_documents')
    .select('id, file_name, file_path, file_type, uploaded_at')
    .eq('patient_id', patientId)
    .order('uploaded_at', { ascending: false });

  if (error || !data || !data.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🗂️</div><p>No files uploaded yet.</p></div>`;
    return;
  }

  list.innerHTML = data.map((doc) => `
    <div class="doc-card">
      <div class="ico">${doc.file_type === 'xray' ? '🩻' : '📄'}</div>
      <div class="name">${escapeHtml(doc.file_name)}</div>
      <div class="row-actions" style="justify-content:center;">
        <button class="btn btn--outline btn--sm" data-view="${doc.id}" data-path="${escapeHtml(doc.file_path)}">View</button>
        <button class="btn btn--danger btn--sm" data-remove="${doc.id}" data-path="${escapeHtml(doc.file_path)}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { data: signed, error: signErr } = await supabase.storage
        .from('patient-documents')
        .createSignedUrl(btn.dataset.path, 60);
      if (signErr || !signed) {
        showToast('Could not open file.', 'error');
        return;
      }
      window.open(signed.signedUrl, '_blank');
    });
  });

  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this file?')) return;
      await supabase.storage.from('patient-documents').remove([btn.dataset.path]);
      await supabase.from('patient_documents').delete().eq('id', btn.dataset.remove);
      showToast('File deleted.');
      await loadDocuments();
    });
  });
}

function wireUpload() {
  document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = document.getElementById('fileType').value;
    const path = `${patientId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('patient-documents')
      .upload(path, file);

    if (uploadError) {
      showToast('Upload failed. Make sure the storage bucket is set up.', 'error');
      return;
    }

    const { error: insertError } = await supabase.from('patient_documents').insert({
      patient_id: patientId,
      file_name: file.name,
      file_path: path,
      file_type: fileType,
      uploaded_by: session.profile.id,
    });

    if (insertError) {
      showToast('File uploaded but could not save record.', 'error');
      return;
    }

    showToast('File uploaded.');
    e.target.value = '';
    await loadDocuments();
  });
}
