// Client-side preference store (theme + language) persisted in localStorage.
// It is read through useSyncExternalStore so React state stays in sync with the
// browser storage without setState-in-effect workarounds; SSR uses the defaults
// below and the blocking script in app/layout.tsx applies them before first paint.
// Every write (and cross-tab storage event) re-applies them to the <html> element.

export type Language = 'EN' | 'ID'

const THEME_KEY = 'crosscart-theme'
const LANG_KEY = 'crosscart-lang'

const listeners = new Set<() => void>()

// Mirror the stored preferences onto <html> (dark/light class + lang attribute).
function applyToDocument() {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const isDark = getThemeSnapshot()
  const lang = getLanguageSnapshot()

  root.classList.toggle('dark', isDark)
  root.classList.toggle('light', !isDark)
  root.style.colorScheme = isDark ? 'dark' : 'light'
  root.lang = lang === 'ID' ? 'id' : 'en'
}

function emit() {
  applyToDocument()
  listeners.forEach((listener) => listener())
}

export function subscribePreferences(listener: () => void) {
  // Cross-tab changes arrive through the storage event; re-apply them to <html>.
  const handleStorage = () => {
    applyToDocument()
    listener()
  }

  listeners.add(listener)
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
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

export function toggleLanguage() {
  setLanguage(getLanguageSnapshot() === 'ID' ? 'EN' : 'ID')
}
