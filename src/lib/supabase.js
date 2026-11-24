import { createClient } from '@supabase/supabase-js'

import { captureAuthUrlState } from './auth-redirect'
import { updatePasswordWithToken } from './password-update'

// Clean even when configuration is missing and startup cannot continue.
captureAuthUrlState()

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        'Supabase environment variables are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.',
    )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'implicit',
    },
})

export function updatePasswordForAccount(options) {
    return updatePasswordWithToken({
        ...options,
        supabaseUrl,
        publishableKey: supabaseKey,
    })
}
