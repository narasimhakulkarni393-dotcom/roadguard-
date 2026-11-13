export const PROFILE_STORAGE_KEY = 'pitscout.profile.v1'
export const APPEARANCE_STORAGE_KEY = 'pitscout.appearance.v1'
export const DIRECTORY_STORAGE_KEY = 'pitscout.directory.v1'

export const PROFILE_EVENT = 'pitscout:profile'
export const APPEARANCE_EVENT = 'pitscout:appearance'

export interface OperatorProfile {
  name: string
  team: string
}

export const DEFAULT_PROFILE: OperatorProfile = {
  name: 'Operations Desk',
  team: 'Road intelligence',
}

export interface AppearancePrefs {
  reduceMotion: boolean
}

export const DEFAULT_APPEARANCE: AppearancePrefs = { reduceMotion: false }

function readJson<T>(key: string): Partial<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : null
  } catch {
    return null
  }
}

export function readProfile(): OperatorProfile {
  const stored = readJson<OperatorProfile>(PROFILE_STORAGE_KEY)
  return {
    name: typeof stored?.name === 'string' && stored.name.trim() ? stored.name : DEFAULT_PROFILE.name,
    team: typeof stored?.team === 'string' && stored.team.trim() ? stored.team : DEFAULT_PROFILE.team,
  }
}

export function writeProfile(profile: OperatorProfile) {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Storage can be disabled; the in-memory value still works for this session.
  }
  window.dispatchEvent(new Event(PROFILE_EVENT))
}

export function readAppearance(): AppearancePrefs {
  const stored = readJson<AppearancePrefs>(APPEARANCE_STORAGE_KEY)
  return { reduceMotion: stored?.reduceMotion === true }
}

export function applyAppearance(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion)
}

export function writeAppearance(prefs: AppearancePrefs) {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage can be disabled; the class is still applied for this session.
  }
  applyAppearance(prefs)
  window.dispatchEvent(new Event(APPEARANCE_EVENT))
}

export function clearLocalWorkspaceData() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY)
    window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
    window.localStorage.removeItem(DIRECTORY_STORAGE_KEY)
  } catch {
    // Nothing else to do when storage is unavailable.
  }
  applyAppearance(DEFAULT_APPEARANCE)
  window.dispatchEvent(new Event(PROFILE_EVENT))
  window.dispatchEvent(new Event(APPEARANCE_EVENT))
}
