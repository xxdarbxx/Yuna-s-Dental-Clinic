import { supabase, requireSession } from '../../shared/supabase-client.js';
import { initAdminNav } from './nav.js';
import { escapeHtml, formatDate, formatCurrency, showToast, openModal, closeModal, initModalDismiss, statusLabel, patientFullName } from '../../shared/ui.js';

const session = await requireSession();
let invoices = [];
let currentInvoiceId = '';
let itemRowCount = 0;

if (session) {
  initAdminNav(session.profile);
  initModalDismiss();
  await loadPatientsDropdown();
  addItemRow();
  wireEvents();
  await loadInvoices();
}

function statusBadgeClass(status) {
  const map = { unpaid: 'badge--red', partial: 'badge--amber', paid: 'badge--green' };
  return map[status] || 'badge--gray';
}

async function loadPatientsDropdown() {
  const { data } = await supabase.from('patients').select('id, first_name, last_name').order('first_name');
  const select = document.getElementById('invoicePatient');
  (data || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = patientFullName(p);
    select.appendChild(opt);
  });
}

async function loadInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, amount_paid, balance, status, created_at, patients(first_name,last_name)')
    .order('created_at', { ascending: false });

  invoices = error ? [] : (data || []);
  const outstanding = invoices.reduce((sum, i) => sum + Number(i.balance || 0), 0);
  document.getElementById('outstandingLabel').textContent = `${formatCurrency(outstanding)} outstanding across ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`;
  applyFilters();
}

function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  let rows = invoices;
  if (status) rows = rows.filter((i) => i.status === status);
  if (q) {
    rows = rows.filter((i) =>
      patientFullName(i.patients).toLowerCase().includes(q) ||
      String(i.invoice_number).includes(q)
    );
  }
  renderTable(rows);
}

function renderTable(rows) {
  const body = document.getElementById('invoicesBody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">No invoices found.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((i) => `
    <tr class="clickable" data-id="${i.id}">
      <td class="cell-strong">#${i.invoice_number}</td>
      <td>${escapeHtml(patientFullName(i.patients)) || '—'}</td>
      <td class="cell-sub">${formatDate(i.created_at)}</td>
      <td style="text-align:right;">${formatCurrency(i.total)}</td>
      <td style="text-align:right;">${formatCurrency(i.amount_paid)}</td>
      <td style="text-align:right;">${formatCurrency(i.balance)}</td>
      <td><span class="badge ${statusBadgeClass(i.status)}">${statusLabel(i.status)}</span></td>
      <td><button class="btn btn--outline btn--sm" data-view="${i.id}">View</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => openDetail(row.dataset.id));
  });
}

function wireEvents() {
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('newInvoiceBtn').addEventListener('click', openInvoiceModal);
  document.getElementById('addItemBtn').addEventListener('click', () => addItemRow());
  document.getElementById('discountAmount').addEventListener('input', recalcSummary);
  document.getElementById('insuranceDeduction').addEventListener('input', recalcSummary);
  document.getElementById('invoiceForm').addEventListener('submit', saveInvoice);
  document.getElementById('paymentForm').addEventListener('submit', recordPayment);
  document.getElementById('printReceiptBtn').addEventListener('click', printReceipt);
}

// ---------- Create Invoice ----------

function openInvoiceModal() {
  document.getElementById('invoiceForm').reset();
  document.getElementById('invoiceError').classList.remove('show');
  document.getElementById('itemRows').innerHTML = '';
  itemRowCount = 0;
  addItemRow();
  recalcSummary();
  openModal('invoiceModal');
}

function addItemRow() {
  itemRowCount++;
  const wrap = document.getElementById('itemRows');
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input type="text" placeholder="Description" class="item-desc" required />
    <input type="number" placeholder="Qty" class="item-qty" value="1" min="1" step="1" />
    <input type="number" placeholder="Unit Price" class="item-price" value="0" min="0" step="0.01" />
    <input type="text" class="item-subtotal" value="₱0.00" disabled />
    <button type="button" class="btn btn--icon btn--sm item-remove" title="Remove">✕</button>
  `;
  wrap.appendChild(row);

  const recalcRow = () => {
    const qty = Number(row.querySelector('.item-qty').value) || 0;
    const price = Number(row.querySelector('.item-price').value) || 0;
    row.querySelector('.item-subtotal').value = formatCurrency(qty * price);
    recalcSummary();
  };
  row.querySelector('.item-qty').addEventListener('input', recalcRow);
  row.querySelector('.item-price').addEventListener('input', recalcRow);
  row.querySelector('.item-remove').addEventListener('click', () => {
    row.remove();
    recalcSummary();
  });
}

function collectItems() {
  return [...document.querySelectorAll('#itemRows .item-row')].map((row) => {
    const qty = Number(row.querySelector('.item-qty').value) || 0;
    const price = Number(row.querySelector('.item-price').value) || 0;
    return {
      description: row.querySelector('.item-desc').value.trim(),
      quantity: qty,
      unit_price: price,
      subtotal: qty * price,
    };
  }).filter((item) => item.description);
}

function recalcSummary() {
  const items = collectItems();
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const discount = Number(document.getElementById('discountAmount').value) || 0;
  const insurance = Number(document.getElementById('insuranceDeduction').value) || 0;
  const total = Math.max(0, subtotal - discount - insurance);

  document.getElementById('sumSubtotal').textContent = formatCurrency(subtotal);
  document.getElementById('sumDiscount').textContent = '-' + formatCurrency(discount);
  document.getElementById('sumInsurance').textContent = '-' + formatCurrency(insurance);
  document.getElementById('sumTotal').textContent = formatCurrency(total);
}

async function saveInvoice(e) {
  e.preventDefault();
  const errorBox = document.getElementById('invoiceError');
  const saveBtn = document.getElementById('invoiceSaveBtn');
  errorBox.classList.remove('show');

  const patientId = document.getElementById('invoicePatient').value;
  const items = collectItems();

  if (!patientId || !items.length) {
    errorBox.textContent = 'Select a patient and add at least one line item.';
    errorBox.classList.add('show');
    return;
  }

  saveBtn.disabled = true;

  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const discountAmount = Number(document.getElementById('discountAmount').value) || 0;
  const insuranceDeduction = Number(document.getElementById('insuranceDeduction').value) || 0;
  const total = Math.max(0, subtotal - discountAmount - insuranceDeduction);

  const { data: invoice, error: invoiceError } = await supabase.from('invoices').insert({
    patient_id: patientId,
    subtotal,
    discount_type: document.getElementById('discountType').value,
    discount_amount: discountAmount,
    insurance_deduction: insuranceDeduction,
    total,
  }).select().single();

  if (invoiceError || !invoice) {
    errorBox.textContent = 'Could not create invoice. Please try again.';
    errorBox.classList.add('show');
    saveBtn.disabled = false;
    return;
  }

  const { error: itemsError } = await supabase.from('invoice_items').insert(
    items.map((i) => ({ ...i, invoice_id: invoice.id }))
  );

  saveBtn.disabled = false;

  if (itemsError) {
    errorBox.textContent = 'Invoice created, but items could not be saved.';
    errorBox.classList.add('show');
    return;
  }

  showToast('Invoice created.');
  closeModal('invoiceModal');
  await loadInvoices();
}

// ---------- View / Pay Invoice ----------

async function openDetail(id) {
  currentInvoiceId = id;
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentError').classList.remove('show');
  await refreshDetail();
  openModal('detailModal');
}

async function refreshDetail() {
  const [{ data: invoice }, { data: items }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*, patients(first_name,last_name)').eq('id', currentInvoiceId).single(),
    supabase.from('invoice_items').select('*').eq('invoice_id', currentInvoiceId),
    supabase.from('payments').select('*').eq('invoice_id', currentInvoiceId).order('paid_at', { ascending: false }),
  ]);

  if (!invoice) return;

  document.getElementById('detailTitle').textContent = `Invoice #${invoice.invoice_number} — ${patientFullName(invoice.patients)}`;
  document.getElementById('detailItems').innerHTML = (items || []).map((i) => `
    <tr>
      <td>${escapeHtml(i.description)}</td>
      <td>${i.quantity}</td>
      <td style="text-align:right;">${formatCurrency(i.unit_price)}</td>
      <td style="text-align:right;">${formatCurrency(i.subtotal)}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="text-center text-muted">No items.</td></tr>`;

  document.getElementById('detailSubtotal').textContent = formatCurrency(invoice.subtotal);
  document.getElementById('detailDiscount').textContent = '-' + formatCurrency(invoice.discount_amount);
  document.getElementById('detailInsurance').textContent = '-' + formatCurrency(invoice.insurance_deduction);
  document.getElementById('detailTotal').textContent = formatCurrency(invoice.total);
  document.getElementById('detailPaid').textContent = formatCurrency(invoice.amount_paid);
  document.getElementById('detailBalance').textContent = formatCurrency(invoice.balance);

  document.getElementById('paymentsBody').innerHTML = (payments || []).map((p) => `
    <tr>
      <td class="cell-sub">${formatDate(p.paid_at)}</td>
      <td>${statusLabel(p.payment_method)}</td>
      <td>${escapeHtml(p.reference_number || '—')}</td>
      <td style="text-align:right;">${formatCurrency(p.amount)}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="text-center text-muted">No payments recorded yet.</td></tr>`;

  const amountInput = document.getElementById('paymentAmount');
  if (Number(invoice.balance) > 0) amountInput.value = invoice.balance;

  window.__currentInvoiceDetail = { invoice, items: items || [], payments: payments || [] };
}

async function recordPayment(e) {
  e.preventDefault();
  const errorBox = document.getElementById('paymentError');
  errorBox.classList.remove('show');

  const amount = Number(document.getElementById('paymentAmount').value);
  if (!amount || amount <= 0) {
    errorBox.textContent = 'Enter a valid payment amount.';
    errorBox.classList.add('show');
    return;
  }

  const { error } = await supabase.from('payments').insert({
    invoice_id: currentInvoiceId,
    amount,
    payment_method: document.getElementById('paymentMethod').value,
    reference_number: document.getElementById('paymentReference').value.trim() || null,
    recorded_by: session.profile.id,
  });

  if (error) {
    errorBox.textContent = 'Could not record payment. Please try again.';
    errorBox.classList.add('show');
    return;
  }

  showToast('Payment recorded.');
  document.getElementById('paymentForm').reset();
  await refreshDetail();
  await loadInvoices();
}

function printReceipt() {
  const detail = window.__currentInvoiceDetail;
  if (!detail) return;
  const { invoice, items } = detail;

  document.getElementById('rInvoiceNo').textContent = `#${invoice.invoice_number}`;
  document.getElementById('rDate').textContent = formatDate(invoice.created_at);
  document.getElementById('rPatient').textContent = patientFullName(invoice.patients);
  document.getElementById('rItems').innerHTML = items.map((i) => `
    <div class="receipt__row"><span>${escapeHtml(i.description)} x${i.quantity}</span><span>${formatCurrency(i.subtotal)}</span></div>
  `).join('');
  document.getElementById('rSubtotal').textContent = formatCurrency(invoice.subtotal);
  document.getElementById('rDiscount').textContent = '-' + formatCurrency(invoice.discount_amount);
  document.getElementById('rInsurance').textContent = '-' + formatCurrency(invoice.insurance_deduction);
  document.getElementById('rTotal').textContent = formatCurrency(invoice.total);
  document.getElementById('rPaid').textContent = formatCurrency(invoice.amount_paid);
  document.getElementById('rBalance').textContent = formatCurrency(invoice.balance);

  document.body.classList.add('printing-receipt');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-receipt'), 300);
}
