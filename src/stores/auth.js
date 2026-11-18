import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { supabase } from '../lib/supabase'

/**
 * Єдине джерело реактивного стану авторизації.
 * Supabase залишається джерелом істини, store лише тримає актуальну сесію.
 */
export const useAuthStore = defineStore('auth', () => {
    const session = ref(null)
    const ready = ref(false)

    const user = computed(() => session.value?.user ?? null)
    const isAuthenticated = computed(() => session.value !== null)

    // Гарантує рівно одну ініціалізацію та одну підписку на onAuthStateChange,
    // навіть якщо initialize() викликають паралельно (наприклад, із router guard).
    let initPromise = null

    function initialize() {
        if (!initPromise) {
            initPromise = (async () => {
                try {
                    const { data, error } = await supabase.auth.getSession()
                    if (error) {
                        console.error('Не вдалося відновити сесію Supabase:', error.message)
                    }
                    session.value = data?.session ?? null
                } catch (error) {
                    console.error('Не вдалося відновити сесію Supabase:', error)
                    session.value = null
                } finally {
                    // Підписка тримає store у синхроні з Supabase: вхід/вихід,
                    // оновлення токена, підтвердження email, інші вкладки.
                    supabase.auth.onAuthStateChange((_event, nextSession) => {
                        session.value = nextSession
                    })
                    ready.value = true
                }
            })()
        }
        return initPromise
    }

    /** Повертає { needsEmailConfirmation: true }, якщо перед входом треба підтвердити email. */
    async function signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        return { needsEmailConfirmation: !data.session }
    }

    async function signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        session.value = data.session
    }

    async function signOut() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        session.value = null
    }

    return {
        session,
        ready,
        user,
        isAuthenticated,
        initialize,
        signUp,
        signIn,
        signOut,
    }
})
