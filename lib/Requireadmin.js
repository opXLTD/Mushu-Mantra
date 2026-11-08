// /lib/requireAdmin.js
// Shared server-side check: the caller must be a logged-in user who is in the `admins` table.
// Usage:  const admin = await requireAdmin(req, res, supabase); if (!admin) return;

async function requireAdmin(req, res, supabase) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Missing auth token' });
    return null;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Not authorized' });
    return null;
  }

  const { data: row, error: adminErr } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminErr) {
    res.status(500).json({ error: 'Could not verify admin status' });
    return null;
  }
  if (!row) {
    res.status(403).json({ error: 'Admins only' });
    return null;
  }
  return userData.user;
}

module.exports = { requireAdmin };
