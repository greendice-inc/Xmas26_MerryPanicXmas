import { useEffect, useState } from 'react'
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

export function setKeyboxRinging(id: number, ringing: boolean) {
  return getBackend().set(COL, String(id), { ringing, updatedAt: Date.now() }).catch(() => {})
}

export function requestKeyboxUnlock(id: number) {
  const now = Date.now()
  return getBackend().set(COL, String(id), { unlockAt: now, updatedAt: now }).catch(() => {})
}

export function requestKeyboxLock(id: number) {
  const now = Date.now()
  return getBackend().set(COL, String(id), { lockAt: now, updatedAt: now }).catch(() => {})
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
