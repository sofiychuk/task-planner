import { createClient } from '@supabase/supabase-js'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!rawSupabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables are missing')
}

// createClient очікує корінь проєкту (https://<ref>.supabase.co).
// Якщо в env значення збережене із суфіксом REST API (/rest/v1), прибираємо його,
// інакше auth-запити підуть на неіснуючий шлях.
const supabaseUrl = rawSupabaseUrl
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/+$/, '')

export const supabase = createClient(supabaseUrl, supabaseKey)
