import type { Backend } from './backend'
import { createFirestoreBackend } from './firestoreBackend'
import { createLocalBackend } from './localBackend'
import { PREVIEW } from '../preview'

let instance: Backend | null = null

/** VITE_FIREBASE_API_KEY があれば Firestore、無ければローカル同期 */
export function getBackend(): Backend {
  if (!instance) {
    instance = import.meta.env.VITE_FIREBASE_API_KEY ? createFirestoreBackend() : createLocalBackend()
    if (PREVIEW) instance = withMemory(instance, ['teams', 'presence', 'keybox'])
  }
  return instance
}

/** プレビュー用：cols のコレクションだけ、この端末のメモリに置く（書いても外に出ない）。ほかは base のまま */
function withMemory(base: Backend, cols: string[]): Backend {
  const mem: Record<string, Record<string, any>> = {}
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const sub = (fn: () => void) => {
    listeners.add(fn)
    fn()
    return () => {
      listeners.delete(fn)
    }
  }
  const local = (col: string) => cols.includes(col)
  return {
    kind: base.kind,
    async set(col, id, data) {
      if (!local(col)) return base.set(col, id, data)
      const all = (mem[col] ??= {})
      all[id] = { ...(all[id] ?? {}), ...data }
      notify()
    },
    async remove(col, id) {
      if (!local(col)) return base.remove(col, id)
      delete mem[col]?.[id]
      notify()
    },
    watchDoc(col, id, cb) {
      if (!local(col)) return base.watchDoc(col, id, cb)
      return sub(() => cb((mem[col]?.[id] as any) ?? null))
    },
    watchCol(col, cb) {
      if (!local(col)) return base.watchCol(col, cb)
      return sub(() => cb({ ...(mem[col] ?? {}) } as any))
    },
  }
}
