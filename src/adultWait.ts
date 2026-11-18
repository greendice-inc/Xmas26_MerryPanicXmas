import { useSyncExternalStore } from 'react'

/** 正解のエルフのあと、次に進む画面へ切り替わるまで */
export const ADULT_WAIT_MS = 40000
/** ステージ3は50秒、LAST（エントツとボール）は1分 */
export const adultWaitMs = (stage: number) => (stage === 3 ? 50000 : stage === 5 ? 60000 : ADULT_WAIT_MS)

/** 正解直後の待ち（40秒・ステージ3は50秒）を、隠しメニューから飛ばすための橋 */
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
