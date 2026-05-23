const PREFIX = 'gully_os_'

export const storage = {
  get(key) {
    try {
      const data = localStorage.getItem(PREFIX + key)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {}
  },
  getAllKeys() {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k.replace(PREFIX, ''))
    }
    return keys
  }
}
