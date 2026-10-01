import { createClient } from '@supabase/supabase-js'

// Chave publicável: pode ficar no código do navegador. A segurança real está nas regras (RLS) do banco.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://gybdgrfklukgrsfomrey.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_gNqnWw9w3gPL9ZaUQJiSvA_DqgjmDak'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const BUCKET = 'helpdesk'
