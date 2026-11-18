// All Supabase access lives here. Components never build queries inline.
const api = (() => {
  const c = window.CONFIG || {};
  const configured = !!(c.supabaseUrl && c.supabaseAnonKey &&
    !c.supabaseUrl.includes('YOUR-') && !c.supabaseAnonKey.includes('YOUR-'));
  const sb = configured ? window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey) : null;

  const q = async (promise) => {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  };
  const here = () => location.origin + location.pathname;

  return {
    configured,
    sb,

    // ---- auth ----
    signIn: (email, password) => q(sb.auth.signInWithPassword({ email, password })),
    signUp: (email, password, display_name, invite_code) => q(sb.auth.signUp({
      email, password,
      options: { emailRedirectTo: here(), data: { display_name, invite_code: invite_code || null } },
    })),
    resetPassword: (email) => q(sb.auth.resetPasswordForEmail(email, { redirectTo: here() })),
    updatePassword: (password) => q(sb.auth.updateUser({ password })),
    signOut: () => sb.auth.signOut(),

    // ---- profile / household ----
    me: (id) => q(sb.from('profiles').select('*, household:households(*)').eq('id', id).single()),
    members: () => q(sb.from('profiles').select('id, display_name, is_kid, created_at').order('created_at')),
    printers: () => q(sb.from('printers').select('*').order('is_default', { ascending: false })),
    updateProfile: (id, patch) => q(sb.from('profiles').update(patch).eq('id', id)),
    updateHousehold: (id, patch) => q(sb.from('households').update(patch).eq('id', id)),
    setMemberKid: (id, isKid) => q(sb.rpc('set_member_kid', { p_member: id, p_is_kid: isKid })),
    rotateInvite: () => q(sb.rpc('rotate_invite_code')),

    // ---- spools ----
    spools: () => q(sb.from('spool_stock').select('*').is('archived_at', null)
      .order('location').order('material').order('name')),
    spoolByCode: (code) => q(sb.from('spool_stock').select('*').eq('code', code.toUpperCase()).maybeSingle()),
    addSpools: (rows) => q(sb.from('spools').insert(rows).select('id, code')),
    updateSpool: (id, patch) => q(sb.from('spools').update(patch).eq('id', id)),
    deleteSpool: (id) => q(sb.from('spools').delete().eq('id', id)),
    moveSpool: (id, location) => q(sb.rpc('move_spool', { p_spool: id, p_location: location })),

    // ---- usage ----
    history: (spoolId) => q(sb.from('usage_log').select('*, by:profiles(display_name)')
      .eq('spool_id', spoolId).order('created_at', { ascending: false }).limit(30)),
    logUsage: (row) => q(sb.from('usage_log').insert(row).select('*, by:profiles(display_name)').single()),
    deleteUsage: (id) => q(sb.from('usage_log').delete().eq('id', id)),

    // ---- minimums / shopping ----
    setFilamentMin: (household_id, spoolman_id, min_g) => min_g === null
      ? q(sb.from('filament_minimums').delete().eq('household_id', household_id).eq('spoolman_id', spoolman_id))
      : q(sb.from('filament_minimums').upsert({ household_id, spoolman_id, min_g })),
    shoppingList: () => q(sb.from('shopping_list').select('*').order('total_remaining_g')),

    // ---- desiccant ----
    drySpots: () => q(sb.from('dry_spot_status').select('*').order('sort').order('name')),
    addDrySpot: (row) => q(sb.from('dry_spots').insert(row).select('id').single()),
    updateDrySpot: (id, patch) => q(sb.from('dry_spots').update(patch).eq('id', id)),
    // target: { spot_id } for an AMS unit / shared box, or { spool_id } for a spool in its own box
    desiccantHistory: (target) => q(sb.from('desiccant_log').select('*, by:profiles(display_name)')
      .match(target).order('created_at', { ascending: false }).limit(10)),
    logDesiccant: (row) => q(sb.from('desiccant_log').insert(row).select('*').single()),
    deleteDesiccant: (id) => q(sb.from('desiccant_log').delete().eq('id', id)),

    // ---- SpoolmanDB upstream (public GitHub API, no auth, 60 requests/hour per IP) ----
    async spoolmanUpstream() {
      const r = await fetch('https://api.github.com/repos/Donkie/SpoolmanDB/commits?path=filaments&per_page=1');
      if (!r.ok) throw new Error('GitHub HTTP ' + r.status);
      const [c] = await r.json();
      return c ? { date: c.commit.committer.date, url: c.html_url, message: c.commit.message.split('\n')[0] } : null;
    },
  };
})();
