import { useSyncExternalStore } from 'react'

/** 正解直後の待ち（スタッフの「次へ」を待つ間）を、隠しメニューから進めるための橋 */
let skip: (() => void) | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function setAdultSkip(fn: (() => void) | null) {
  skip = fn
  emit()
}

export function useAdultSkip(): (() => void) | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => skip,
  )
}
