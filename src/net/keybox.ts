import { useEffect, useState, useSyncExternalStore } from 'react'
import { getBackend } from './index'

/**
 * キーボックスへの指令。プレイヤー・スタッフはここに書き、
 * USB アンテナをつないだマスター画面が読んでキーボックスに送る
 */
export interface KeyboxDoc {
  /** true のあいだ、0・0・0・0・確定 の音を鳴らし続ける */
  ringing?: boolean
  /** この時刻に解錠を頼まれた（変わったらマスターが解錠する） */
  unlockAt?: number
  /** この時刻に施錠を頼まれた */
  lockAt?: number
  updatedAt?: number
}

/** マスターの USB アンテナの状態（キーボックス番号ではなく 'link' という文書） */
export interface KeyboxLinkDoc {
  connected: boolean
  updatedAt: number
}

const COL = 'keybox'
export const LINK_ID = 'link'

/** 指令を書き込めなかったか（Firestore のルール未反映・オフラインなど） */
let failed = false
const failListeners = new Set<() => void>()
function setFailed(v: boolean) {
  if (failed === v) return
  failed = v
  failListeners.forEach((l) => l())
}
export function useKeyboxSendFailed(): boolean {
  return useSyncExternalStore(
    (cb) => {
      failListeners.add(cb)
      return () => failListeners.delete(cb)
    },
    () => failed,
  )
}

function write(id: string, data: Record<string, unknown>) {
  return getBackend()
    .set(COL, id, data)
    .then(() => setFailed(false))
    .catch((e) => {
      console.error('キーボックスへの指令を書き込めません', e)
      setFailed(true)
    })
}

export function setKeyboxRinging(id: number, ringing: boolean) {
  return write(String(id), { ringing, updatedAt: Date.now() })
}

export function requestKeyboxUnlock(id: number) {
  const now = Date.now()
  return write(String(id), { unlockAt: now, updatedAt: now })
}

export function requestKeyboxLock(id: number) {
  const now = Date.now()
  return write(String(id), { lockAt: now, updatedAt: now })
}

export function setKeyboxLink(connected: boolean) {
  return getBackend().set(COL, LINK_ID, { connected, updatedAt: Date.now() }).catch(() => {})
}

/** キーボックスの文書をすべて見る（'1', '2', ... と 'link'） */
export function useKeyboxAll(): Record<string, KeyboxDoc & Partial<KeyboxLinkDoc>> {
  const [all, setAll] = useState<Record<string, KeyboxDoc & Partial<KeyboxLinkDoc>>>({})
  useEffect(() => getBackend().watchCol(COL, setAll), [])
  return all
}
