import { AuthClient } from '@supabase/supabase-js'

export function createAuthStorage() {
  try {
    const storage = globalThis.localStorage
    const probe = 'planner-auth-storage-probe'
    storage.setItem(probe, '')
    storage.removeItem(probe)
    return storage
  } catch {
    // Match the SDK's in-memory fallback when browser storage is unavailable.
    const items = new Map()
    return {
      getItem: key => items.get(key) ?? null,
      setItem: (key, value) => { items.set(key, value) },
      removeItem: key => { items.delete(key) },
    }
  }
}

export async function importIncomingSession({
  supabaseUrl, publishableKey, storage, storageKey, credentials, fetchImpl,
}) {
  const previous = storage.getItem(storageKey)
  // An unsuccessful setSession can emit SIGNED_OUT and remove its storage.
  // Give the incoming exchange neither shared storage nor a shared channel.
  const isolated = new AuthClient({
    url: new URL('auth/v1', `${supabaseUrl.replace(/\/+$/, '')}/`).href,
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
    storageKey: `${storageKey}-incoming`,
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: fetchImpl,
  })
  let session
  try {
    const { data, error } = await isolated.setSession(credentials)
    if (error) return { error }
    session = data.session
  } finally {
    await isolated.dispose()
  }
  if (!session?.user?.id) return { error: { code: 'otp_expired' } }
  if (storage.getItem(storageKey) !== previous) return { error: { code: 'account_changed' } }
  // Seed the explicitly configured storage before starting the shared SDK.
  // It restores/broadcasts the session normally; never restore an old snapshot.
  storage.setItem(storageKey, JSON.stringify(session))
  return { userId: session.user.id, error: null }
}
