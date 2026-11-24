import { readFile } from 'node:fs/promises'
import * as vue from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import * as errors from '../src/lib/auth-errors.js'
import * as validation from '../src/lib/validation.js'
import { useActiveView } from '../src/composables/useActiveView.js'
import { useResendCooldown } from '../src/composables/useResendCooldown.js'

export const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
export const helperSource = (await readFile(new URL('../src/lib/auth-redirect.js', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env.BASE_URL', "'/'")
export const helpers = await import(dataModule(helperSource))
let moduleId = 0

export function location(path) {
  const entries = [new URL(path, 'https://planner.example')]
  globalThis.window = {
    location: entries[0],
    history: {
      state: { audit: true },
      replaceState(state, _title, next) {
        this.state = state
        entries[entries.length - 1] = new URL(next, window.location)
        window.location = entries.at(-1)
      },
    },
  }
  helpers.captureAuthUrlState()
  return entries
}

export async function storeWith(mock, update = async () => ({ error: null }), overrides = {}) {
  const key = `__authTest${++moduleId}`
  globalThis[key] = {
    getSupabase: () => mock,
    updatePasswordForAccount: update,
    verifyPasswordAccount: ({ accessToken }) => mock.auth.getUser(accessToken),
    establishIncomingSession: async credentials => {
      const { data, error } = await mock.auth.setSession(credentials)
      return { userId: data?.session?.user?.id, error }
    },
    ...overrides,
  }
  const source = (await readFile(new URL('../src/stores/auth.js', import.meta.url), 'utf8'))
    .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replace("from 'pinia'", `from '${import.meta.resolve('pinia')}'`)
    .replace("import { establishIncomingSession, getSupabase, updatePasswordForAccount, verifyPasswordAccount } from '../lib/supabase'",
      `const { establishIncomingSession, getSupabase, updatePasswordForAccount, verifyPasswordAccount } = globalThis.${key}`)
    .replace("'../lib/auth-errors'", `'${new URL('../src/lib/auth-errors.js', import.meta.url).href}'`)
    .replace("'../lib/auth-diagnostics'", `'${new URL('../src/lib/auth-diagnostics.js', import.meta.url).href}'`)
    .replace("'../lib/auth-redirect'", `'${dataModule(helperSource)}'`)
    .replaceAll('import.meta.hot', 'false')
  const { useAuthStore } = await import(dataModule(`${source}\n// ${key}`))
  delete globalThis[key]
  setActivePinia(createPinia())
  return useAuthStore()
}

export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

export const sessionFor = id => ({
  user: { id, email: `${id}@example.invalid` },
  access_token: `synthetic-${id}`, refresh_token: 'synthetic-refresh',
})

export function authMock(initial = sessionFor('A')) {
  let session = initial
  let callback = () => {}
  const mock = {
    emit(next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') {
      session = next
      callback(event, next)
    },
    setStorage(next) { session = next },
    auth: {
      onAuthStateChange(fn) {
        callback = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
      initialize: async () => ({ error: null }),
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async token => ({
        data: { user: sessionFor(token.replace('synthetic-', '')).user }, error: null,
      }),
      setSession: async credentials => {
        session = sessionFor(credentials.access_token.replace('synthetic-', ''))
        callback('SIGNED_IN', session)
        return { data: { session }, error: null }
      },
      signOut: async () => { mock.emit(null); return { error: null } },
    },
  }
  return mock
}

// Run the actual SFC script in a real Vue component/effect scope. Only DOM
// rendering and external dependencies are replaced; Vue owns lifecycle/watchers.
// This is not a browser/E2E test and does not claim native history coverage.
export async function mountView(name, auth, exposed, overrides = {}) {
  const source = await readFile(new URL(
    name === 'App' ? '../src/App.vue' : `../src/views/auth/${name}.vue`, import.meta.url,
  ), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  const navigations = []
  const deps = {
    ...vue, ...helpers, ...errors, ...validation, useActiveView, useResendCooldown,
    useAuthStore: () => auth,
    useRoute: () => ({ query: {} }),
    useRouter: () => ({ replace: target => { navigations.push(target); return Promise.resolve() } }),
    ...overrides,
  }
  for (const key of Object.keys(deps)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(key)) delete deps[key]
  }
  const factory = new Function(...Object.keys(deps), `${script}\nreturn { ${exposed.join(', ')} }`)
  let state
  const renderer = vue.createRenderer({
    createComment: () => ({}), createText: () => ({}), createElement: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  })
  const app = renderer.createApp({
    setup() {
      state = factory(...Object.values(deps))
      return () => null
    },
  })
  app.mount({})
  return { state, navigations, unmount: () => app.unmount() }
}

export async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await vue.nextTick()
}
