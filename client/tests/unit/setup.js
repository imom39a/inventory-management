// Node 25 exposes its own experimental `localStorage` global, which shadows jsdom's and is
// unusable without --localstorage-file. App composables read localStorage at import time,
// so install a simple in-memory Storage before any test file imports app code.
const store = new Map()
const memoryStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size
  }
}

Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true })
