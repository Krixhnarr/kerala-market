import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same project the website uses. The anon key is designed to be shipped in
// clients; row-level security in Postgres is what protects the data.
const SUPABASE_URL = 'https://kspeovtntddidtdeedtl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzcGVvdnRudGRkaWR0ZGVlZHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3OTkzMjEsImV4cCI6MjEwNTM3NTMyMX0.eWDCI4lh_jNQwd3y7xnwWH2BsaiVTpvaxzvIabhBba4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
