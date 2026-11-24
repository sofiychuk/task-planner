import { createClient } from '@supabase/supabase-js'

import { captureAuthUrlState } from './auth-redirect'
import { getUserWithToken, updatePasswordWithToken } from './password-update'
import { createAuthStorage, importIncomingSession } from './incoming-session'

// Clean even when configuration is missing and startup cannot continue.
captureAuthUrlState()

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        'Supabase environment variables are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.',
    )
}

// Explicitly retain the installed SDK's default key for existing sessions and tabs.
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
const storage = createAuthStorage()
const authConfig = { supabaseUrl, publishableKey: supabaseKey }
let supabase

export function getSupabase() {
    return supabase ??= createClient(supabaseUrl, supabaseKey, {
        auth: {
            storage,
            storageKey,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: 'implicit',
        },
    })
}

export function establishIncomingSession(credentials) {
    return importIncomingSession({ ...authConfig, storage, storageKey, credentials })
}

export function verifyPasswordAccount(options) {
    return getUserWithToken({ ...options, ...authConfig })
}

export function updatePasswordForAccount(options) {
    return updatePasswordWithToken({ ...options, ...authConfig })
}
