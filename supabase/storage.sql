-- Yuna's Dental Clinic — Storage setup
-- Run this after schema.sql in the Supabase SQL editor.
-- Creates a private bucket for patient x-rays/documents, readable and
-- writable only by logged-in staff (matches the public.is_staff() helper
-- defined in schema.sql).

insert into storage.buckets (id, name, public)
values ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

create policy "patient-documents: staff read" on storage.objects
  for select to authenticated using (bucket_id = 'patient-documents' and public.is_staff());

create policy "patient-documents: staff upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'patient-documents' and public.is_staff());

create policy "patient-documents: staff delete" on storage.objects
  for delete to authenticated using (bucket_id = 'patient-documents' and public.is_staff());
