// Supabase → Project Settings → API.
// The anon (public) key is meant to be public: Row Level Security protects the data.
// NEVER put the service_role key here.
window.CONFIG = {
  supabaseUrl: 'https://dgvothlfffojggrldbkb.supabase.co',
  supabaseAnonKey: 'sb_publishable_tkZylFHRHzhdUnK2B_ynyg_xMWH8GQA',

  // Used for QR codes / NFC tags so printed labels always point at the live site,
  // even when you print them from localhost.
  siteUrl: 'https://balexandre.github.io/filament-stock/',
};
