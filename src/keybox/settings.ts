import { useCallback, useEffect, useState } from 'react'
import { KEYBOX_COUNT, KEYBOX_DEFAULTS } from '../config'
import { getBackend } from '../net'

/** キーボックス1台ぶんの無線設定。送る・受けるときに使うのは ad だけ（id・ch はアンテナと合わせるための控え） */
export interface KeyboxSetting {
  id: string
  ch: number
  ad: number
}

export type KeyboxSettings = Record<number, KeyboxSetting>

const COL = 'config'
const DOC = 'keybox'

function merge(stored: Record<string, Partial<KeyboxSetting>> | undefined): KeyboxSettings {
  const out: KeyboxSettings = {}
  for (let n = 1; n <= KEYBOX_COUNT; n++) {
    out[n] = { ...KEYBOX_DEFAULTS[n], ...(stored?.[String(n)] ?? {}) }
  }
  return out
}

/** ID（16進8桁）・ch（0〜99）・ad（16進2桁）の書き方が正しいか。正しければ null、違えば理由 */
export function validateSetting(id: string, ch: string, ad: string): string | null {
  if (!/^[0-9A-Fa-f]{8}$/.test(id.trim())) return 'ID は16進8桁（例 54554D03）'
  if (!/^\d{1,2}$/.test(ch.trim())) return 'ch は0〜99の数字'
  if (!/^[0-9A-Fa-f]{1,2}$/.test(ad.trim())) return 'ad は16進2桁（例 06）'
  const n = parseInt(ad, 16)
  if (n < 1 || (n > 0x64 && n !== 0x78)) return 'ad は 01〜64（全台一斉は 78）'
  return null
}

/** 4台ぶんの設定を、全端末で共有して読み書きする（Firestore の config/keybox） */
export function useKeyboxSettings(): [KeyboxSettings, (next: KeyboxSettings) => Promise<boolean>] {
  const [settings, setSettings] = useState<KeyboxSettings>(() => merge(undefined))
  useEffect(
    () =>
      getBackend().watchDoc<{ boxes?: Record<string, Partial<KeyboxSetting>> }>(COL, DOC, (d) => setSettings(merge(d?.boxes))),
    [],
  )
  const save = useCallback(async (next: KeyboxSettings) => {
    const boxes: Record<string, KeyboxSetting> = {}
    for (const [n, v] of Object.entries(next)) boxes[n] = { id: v.id.toUpperCase(), ch: v.ch, ad: v.ad }
    try {
      await getBackend().set(COL, DOC, { boxes, updatedAt: Date.now() })
      return true
    } catch (e) {
      console.error('キーボックスの設定を保存できません', e)
      return false
    }
  }, [])
  return [settings, save]
}

/** キーボックス番号 → ad */
export function addrsOf(settings: KeyboxSettings): Record<number, number> {
  return Object.fromEntries(Object.entries(settings).map(([n, v]) => [Number(n), v.ad]))
}
