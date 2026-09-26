// Client-side preference store (theme + language) persisted in localStorage.
// It is read through useSyncExternalStore so React state stays in sync with the
// browser storage without setState-in-effect workarounds; SSR uses the defaults
// below and the blocking script in app/layout.tsx applies them before first paint.

export type Language = 'EN' | 'ID'

const THEME_KEY = 'crosscart-theme'
const LANG_KEY = 'crosscart-lang'

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribePreferences(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function getThemeSnapshot(): boolean {
  return window.localStorage.getItem(THEME_KEY) !== 'light'
}

export function getLanguageSnapshot(): Language {
  return window.localStorage.getItem(LANG_KEY) === 'ID' ? 'ID' : 'EN'
}

export function getServerThemeSnapshot(): boolean {
  return true
}

export function getServerLanguageSnapshot(): Language {
  return 'EN'
}

export function setTheme(dark: boolean) {
  window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  emit()
}

export function toggleTheme() {
  setTheme(!getThemeSnapshot())
}

export function setLanguage(next: Language) {
  window.localStorage.setItem(LANG_KEY, next)
  emit()
}
