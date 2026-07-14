# Yuna's Dental Clinic

Public website + staff admin dashboard for Yuna's Dental Clinic (2021 Mindanao Ave., Sampaloc, Manila). Plain HTML/CSS/JS, no build step, backed by Supabase and deployed on Vercel.

## Project structure

```
index.html, about.html, services.html, contact.html, book-appointment.html   → public site
assets/                                                                       → public site css/js/images
admin/                                                                        → staff dashboard (login required)
  login.html, dashboard.html, patients.html, patient-profile.html,
  appointments.html, treatments.html, billing.html
  css/dashboard.css, js/*.js
shared/
  supabase-client.js   → single Supabase client + auth helpers
  ui.js                → shared modal/toast/table/formatting helpers
supabase/
  schema.sql           → tables, RLS policies, triggers
  storage.sql           → patient-documents storage bucket + policies
```

## One-time setup

1. **Create the Supabase project** (already done) and grab:
   - Project URL: `Settings → API → Project URL`
   - Publishable (anon) key: already set in `shared/supabase-client.js`

2. **Set the project URL.** Open `shared/supabase-client.js` and replace:
   ```js
   const SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_URL';
   ```
   with your actual `https://xxxxx.supabase.co` URL.

3. **Run the database schema.** In the Supabase Dashboard → SQL Editor → New query, run `supabase/schema.sql`, then run `supabase/storage.sql`.

4. **Create the first staff/admin account:**
   - Supabase Dashboard → Authentication → Users → Add user (set an email + password).
   - Copy the new user's UUID.
   - In the SQL Editor, run:
     ```sql
     insert into public.profiles (id, full_name, role)
     values ('paste-the-user-uuid-here', 'Your Name', 'admin');
     ```
   - You can now sign in at `/admin/login.html`. Admins can add more staff the same way (staff role can read/write clinic data but can't delete records or manage other profiles).

5. **Patients tab in Supabase Storage:** `storage.sql` creates a private `patient-documents` bucket automatically — no manual step needed there.

## Local development

This project has no build step — it's served as static files. Run it with:

```powershell
./serve.ps1
```

This starts a local server at `http://localhost:3462` (registered in `.claude/launch.json` as `yunas-dental-clinic`). It must be served over `http://`, not opened as a `file://` path, because the Supabase client uses ES module imports.

## Deployment

- Push to the connected GitHub repo (`xxdarbxx/Yuna-s-Dental-Clinic`) — Vercel auto-deploys on push to `main`.
- `vercel.json` is minimal (`cleanUrls`, no trailing slash) since this is a static site with no build command.

## How the public booking flow works

The public "Book Appointment" and "Contact" forms insert directly into the `appointments` table as `status = 'requested'` with guest contact fields (no login required — allowed by a narrow RLS policy that only permits `status = 'requested'` inserts with no `patient_id`). Staff review these under **Appointments** in the dashboard and either update the request in place or match it to a patient record.

## Notes on scope

- The tooth chart in **Treatments** is a simplified 32-tooth clickable grid (FDI numbering), not anatomical artwork — chosen to keep the feature fast and functional.
- "Recent activity" on the dashboard is computed by combining the latest patients, appointments, and payments client-side rather than a dedicated activity-log table.
- Receipts print via the browser's print dialog (`window.print()`) using a print-only stylesheet — no PDF generation library involved.
