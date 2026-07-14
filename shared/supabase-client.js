// Shared Supabase client for Yuna's Dental Clinic (public site + admin)
// Loaded as an ES module: <script type="module" src="/shared/supabase-client.js"></script>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// TODO: replace with your Supabase project URL (Dashboard → Settings → API).
const SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cNE6-bnaV7ebakP_LbEihw_YXJv4btx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Redirects to the login page if there is no active session.
// Returns the session's user + profile row ({ id, full_name, role }) on success.
export async function requireSession(redirectTo = '/admin/login.html') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', session.user.id)
    .single();
  if (error || !profile) {
    window.location.href = redirectTo;
    return null;
  }
  return { user: session.user, profile };
}

export async function signOut(redirectTo = '/admin/login.html') {
  await supabase.auth.signOut();
  window.location.href = redirectTo;
}
