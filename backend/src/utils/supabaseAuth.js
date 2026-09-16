async function getSupabaseUser(accessToken) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !accessToken) return null;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: key,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

module.exports = { getSupabaseUser };
