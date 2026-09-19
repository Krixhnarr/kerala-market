// Public configuration for the dashboard. The anon key is designed to be
// shipped to browsers: row-level security in Postgres is what protects data.
window.CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
  // Set true after enabling the Google provider in Supabase → Authentication → Providers.
  googleAuth: false,
  // Item IDs pinned as tiles at the top (Manorama's itemId; stable across years).
  featured: [
    254, // Kochi · Coconut Oil Ready
    256, // Kochi · Raw Copra
    267, // Kochi · Arecanut / Betel Nut - New
    196, // Kozhikode · Arecanut / Betel Nut
    263, // Kochi · Black Pepper · Garbled
    147, // Kottayam Rubber Board · RSS 4
  ],
};
