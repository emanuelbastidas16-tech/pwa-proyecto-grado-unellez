const SUPABASE_URL = 'https://poaleujrfuurfzphcqdh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CS4ntpeJOOA4frWZdzJxew_61Tl8FFF';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sbClient = sbClient;