-- Yuna's Dental Clinic — Supabase schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Run supabase/storage.sql afterwards to set up the patient documents/x-rays bucket.

-- ============================================================
-- PROFILES (extends auth.users with a role: admin | staff)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create policy "profiles: read own row" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: admin reads all" on public.profiles
  for select using (public.is_admin());

create policy "profiles: admin manages all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Keeps updated_at columns fresh on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- PATIENTS
-- ============================================================
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text,
  phone text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  blood_type text,
  allergies text,
  medical_history text,
  dental_history text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patients enable row level security;
create index if not exists patients_last_name_idx on public.patients (last_name);

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

create policy "patients: staff read" on public.patients
  for select to authenticated using (public.is_staff());

create policy "patients: staff insert" on public.patients
  for insert to authenticated with check (public.is_staff());

create policy "patients: staff update" on public.patients
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "patients: admin delete" on public.patients
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- APPOINTMENTS
-- ============================================================
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete set null,
  guest_name text,
  guest_email text,
  guest_phone text,
  dentist_id uuid references public.profiles (id) on delete set null,
  appointment_date date not null,
  start_time time not null,
  end_time time,
  service_type text,
  status text not null default 'requested' check (status in (
    'requested', 'scheduled', 'confirmed', 'checked_in', 'waiting',
    'in_progress', 'completed', 'cancelled', 'no_show'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments enable row level security;
create index if not exists appointments_date_idx on public.appointments (appointment_date);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create policy "appointments: staff read" on public.appointments
  for select to authenticated using (public.is_staff());

create policy "appointments: staff insert" on public.appointments
  for insert to authenticated with check (public.is_staff());

-- Public booking form: anonymous visitors may only create a bare "requested"
-- appointment with no linked patient record — they can't read, update, or
-- attach it to existing data.
create policy "appointments: public request insert" on public.appointments
  for insert to anon with check (status = 'requested' and patient_id is null);

create policy "appointments: staff update" on public.appointments
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "appointments: admin delete" on public.appointments
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- TREATMENT PLANS
-- ============================================================
create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  procedure text not null check (procedure in (
    'Cleaning', 'Filling', 'Root Canal', 'Extraction', 'Braces', 'Crown', 'Veneers', 'Other'
  )),
  tooth_numbers text,
  dentist_id uuid references public.profiles (id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  cost numeric(10, 2) not null default 0,
  dentist_notes text,
  date_performed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.treatment_plans enable row level security;
create index if not exists treatment_plans_patient_idx on public.treatment_plans (patient_id);

create trigger treatment_plans_set_updated_at
  before update on public.treatment_plans
  for each row execute function public.set_updated_at();

create policy "treatment_plans: staff read" on public.treatment_plans
  for select to authenticated using (public.is_staff());

create policy "treatment_plans: staff insert" on public.treatment_plans
  for insert to authenticated with check (public.is_staff());

create policy "treatment_plans: staff update" on public.treatment_plans
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "treatment_plans: admin delete" on public.treatment_plans
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- INVOICES + INVOICE ITEMS + PAYMENTS
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity,
  patient_id uuid not null references public.patients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  subtotal numeric(10, 2) not null default 0,
  discount_type text not null default 'none' check (discount_type in ('none', 'senior', 'pwd', 'insurance', 'custom')),
  discount_amount numeric(10, 2) not null default 0,
  insurance_deduction numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2) not null default 0,
  balance numeric(10, 2) generated always as (total - amount_paid) stored,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
create index if not exists invoices_patient_idx on public.invoices (patient_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create policy "invoices: staff read" on public.invoices
  for select to authenticated using (public.is_staff());

create policy "invoices: staff insert" on public.invoices
  for insert to authenticated with check (public.is_staff());

create policy "invoices: staff update" on public.invoices
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "invoices: admin delete" on public.invoices
  for delete to authenticated using (public.is_admin());

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null default 0,
  subtotal numeric(10, 2) not null default 0
);

alter table public.invoice_items enable row level security;
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);

create policy "invoice_items: staff read" on public.invoice_items
  for select to authenticated using (public.is_staff());

create policy "invoice_items: staff insert" on public.invoice_items
  for insert to authenticated with check (public.is_staff());

create policy "invoice_items: staff update" on public.invoice_items
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "invoice_items: staff delete" on public.invoice_items
  for delete to authenticated using (public.is_staff());

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(10, 2) not null,
  payment_method text not null default 'cash' check (payment_method in (
    'cash', 'gcash', 'maya', 'credit_card', 'bank_transfer'
  )),
  reference_number text,
  notes text,
  recorded_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz not null default now()
);

alter table public.payments enable row level security;
create index if not exists payments_invoice_idx on public.payments (invoice_id);

create policy "payments: staff read" on public.payments
  for select to authenticated using (public.is_staff());

create policy "payments: staff insert" on public.payments
  for insert to authenticated with check (public.is_staff());

create policy "payments: staff update" on public.payments
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "payments: admin delete" on public.payments
  for delete to authenticated using (public.is_admin());

-- Recomputes amount_paid / status on the parent invoice whenever a payment
-- is added, edited, or removed, so the balance is always derived from the
-- actual payments on file rather than trusted from the client.
create or replace function public.recalc_invoice_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  paid numeric(10, 2);
  invoice_total numeric(10, 2);
begin
  select coalesce(sum(amount), 0) into paid from public.payments where invoice_id = target_invoice_id;
  select total into invoice_total from public.invoices where id = target_invoice_id;

  update public.invoices
  set amount_paid = paid,
      status = case
        when paid <= 0 then 'unpaid'
        when paid >= invoice_total then 'paid'
        else 'partial'
      end
  where id = target_invoice_id;

  return coalesce(new, old);
end;
$$;

create trigger payments_recalc_invoice
  after insert or update or delete on public.payments
  for each row execute function public.recalc_invoice_totals();

-- ============================================================
-- PATIENT DOCUMENTS (x-rays, files — stored in the "patient-documents"
-- Supabase Storage bucket, see storage.sql)
-- ============================================================
create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null default 'document' check (file_type in ('xray', 'document')),
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

alter table public.patient_documents enable row level security;
create index if not exists patient_documents_patient_idx on public.patient_documents (patient_id);

create policy "patient_documents: staff read" on public.patient_documents
  for select to authenticated using (public.is_staff());

create policy "patient_documents: staff insert" on public.patient_documents
  for insert to authenticated with check (public.is_staff());

create policy "patient_documents: staff delete" on public.patient_documents
  for delete to authenticated using (public.is_staff());
