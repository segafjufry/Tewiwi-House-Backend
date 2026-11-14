import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const isAdminDemoMode =
  import.meta.env.DEV &&
  !isSupabaseConfigured &&
  import.meta.env.VITE_ADMIN_DEMO_MODE !== 'false'

const demoEmail = 'demo@tewiwi.local'
const demoPassword = 'TewiwiDemo123!'
const demoSessionKey = 'tewiwi-admin-demo-session'

const supabase = isSupabaseConfigured && !isAdminDemoMode
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

function getAuthClient() {
  if (!supabase) {
    throw new Error(
      'Autentikasi belum dikonfigurasi. Tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.',
    )
  }

  return supabase
}

function throwOnError({ error }) {
  if (error) {
    throw error
  }
}

export function subscribeToAuthChanges(onSessionChange) {
  if (!supabase) {
    return () => {}
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    onSessionChange(session)
  })

  return () => subscription.unsubscribe()
}

export async function signInAdmin(email, password) {
  if (isAdminDemoMode) {
    if (email.toLowerCase() !== demoEmail || password !== demoPassword) {
      throw new Error('Email atau password demo tidak valid.')
    }

    const session = { user: { email: demoEmail }, isDemo: true }
    window.sessionStorage.setItem(demoSessionKey, JSON.stringify(session))
    return session
  }

  const result = await getAuthClient().auth.signInWithPassword({ email, password })
  throwOnError(result)
  return result.data.session
}

export async function signOutAdmin() {
  if (isAdminDemoMode) {
    window.sessionStorage.removeItem(demoSessionKey)
    return
  }

  const result = await getAuthClient().auth.signOut()
  throwOnError(result)
}

export async function requestAdminPasswordReset(email) {
  if (isAdminDemoMode) {
    throw new Error('Reset password tidak tersedia dalam mode demo.')
  }

  const result = await getAuthClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/admin/reset-password`,
  })
  throwOnError(result)
}

export async function updateAdminPassword(password) {
  if (isAdminDemoMode) {
    throw new Error('Reset password tidak tersedia dalam mode demo.')
  }

  const result = await getAuthClient().auth.updateUser({ password })
  throwOnError(result)
}

export function getInitialAdminSession() {
  if (!isAdminDemoMode) {
    return null
  }

  const savedSession = window.sessionStorage.getItem(demoSessionKey)
  return savedSession ? JSON.parse(savedSession) : null
}
