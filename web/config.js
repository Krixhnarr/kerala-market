// Public configuration for the dashboard. The anon key is designed to be
// shipped to browsers: row-level security in Postgres is what protects data.
window.CONFIG = {
  supabaseUrl: "https://kspeovtntddidtdeedtl.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzcGVvdnRudGRkaWR0ZGVlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3OTkzMjEsImV4cCI6MjEwNTM3NTMyMX0.eWDCI4lh_jNQwd3y7xnwWH2BsaiVTpvaxzvIabhBba4",
  // Set true after enabling the Google provider in Supabase → Authentication → Providers.
  googleAuth: false,
  // Item IDs pinned as tiles at the top (feed itemId; stable across years).
  featured: [
    254, // Kochi · Coconut Oil Ready
    256, // Kochi · Raw Copra
    267, // Kochi · Arecanut / Betel Nut - New
    196, // Kozhikode · Arecanut / Betel Nut
    263, // Kochi · Black Pepper · Garbled
    147, // Kottayam Rubber Board · RSS 4
  ],
};
