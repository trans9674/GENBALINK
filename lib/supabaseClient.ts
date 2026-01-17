import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gzsteoveweaqyxlxdytz.supabase.co';
// Provided key
const SUPABASE_KEY = 'sb_publishable_gNBpneynVO6uMEn-W1ChSA_CkFQfua9'; 

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);