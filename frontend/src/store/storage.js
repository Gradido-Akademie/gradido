// Device-local preferences that must outlive a logout.
//
// The wallet and the admin interface are served from the same origin and
// therefore share a single localStorage. A logout in either one must not wipe
// the other's device-local preferences (e.g. the dark-mode theme, the moderator
// signature). The blunt localStorage.clear() used to do exactly that, and every
// new preference had to be hand-listed in BOTH logout paths or it got lost.
//
// New device-local preferences should use PREFERENCE_KEY_PREFIX so they are
// preserved automatically, without touching this file again. The explicit list
// below stays frozen at the two pre-existing keys, which are intentionally NOT
// renamed onto the prefix so current users keep their already-stored settings.
//
// NOTE: keep this file identical in frontend/src/store and admin/src/store.
export const PREFERENCE_KEY_PREFIX = 'pref.'
export const PRESERVED_LEGACY_KEYS = ['gradido-theme-mode', 'crea.moderatorSignature']

// Drop-in replacement for localStorage.clear() on logout: removes every key
// EXCEPT device-local preferences. Deleting is the default, so a forgotten
// sensitive key is cleared rather than accidentally kept.
export function clearStoragePreservingPreferences() {
  const preserved = {}
  for (const key of PRESERVED_LEGACY_KEYS) {
    const value = localStorage.getItem(key)
    if (value !== null) {
      preserved[key] = value
    }
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key !== null && key.startsWith(PREFERENCE_KEY_PREFIX)) {
      preserved[key] = localStorage.getItem(key)
    }
  }
  localStorage.clear()
  for (const key of Object.keys(preserved)) {
    localStorage.setItem(key, preserved[key])
  }
}
