import { useCallback, useEffect, useRef, useState } from 'react'
import { HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, TEAM_COUNT } from '../config'
import { DEFAULT_TEAM, presenceKey, type Identity, type PresenceDoc, type TeamDoc } from '../types'
import { getBackend } from './index'

/** 自分の接続状況を定期的に書き込む */
export function usePresence(identity: Identity) {
  useEffect(() => {
    // ?debug=true の開発中は、入室の信号を送らない（Firestore の書き込み回数を使わないため）
    if (new URLSearchParams(location.search).get('debug') === 'true') return
    const b = getBackend()
    const key = presenceKey(identity)
    const beat = () => b.set('presence', key, { lastSeen: Date.now() }).catch(() => {})
    beat()
    const t = setInterval(beat, HEARTBEAT_MS)
    const leave = () => b.set('presence', key, { lastSeen: 0 }).catch(() => {})
    // タブを閉じる・ページを離れるときも、できるだけ待たずに切断扱いにする（届かなければ、期限切れで切れる）
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(t)
      window.removeEventListener('pagehide', leave)
      // 役割選択に戻ったとき「起動中」が残らないよう、すぐに切断扱いにする
      b.set('presence', key, { lastSeen: 0 }).catch(() => {})
    }
  }, [identity.role, identity.id])
}

/** 現在時刻（接続判定の再評価用） */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/**
 * 接続状況の一覧。端末ごとに時計がずれていても正しく判定できるよう、書かれた時刻（lastSeen）ではなく、
 * 「この端末が、lastSeen の値が変わったのを見た時刻（seenAt）」で、生きているかを決める
 */
export function usePresenceAll(): Record<string, PresenceDoc> {
  const [all, setAll] = useState<Record<string, PresenceDoc>>({})
  const seen = useRef<Record<string, { lastSeen: number; seenAt: number }>>({})
  useEffect(
    () =>
      getBackend().watchCol<PresenceDoc>('presence', (raw) => {
        const now = Date.now()
        const next: Record<string, PresenceDoc> = {}
        for (const [k, p] of Object.entries(raw)) {
          const prev = seen.current[k]
          let seenAt: number
          if (p.lastSeen === 0) seenAt = 0
          else if (prev && prev.lastSeen === p.lastSeen) seenAt = prev.seenAt
          // 値が変わった＝いま生きている。はじめて見た値は、時計のずれを見込んで1分以内なら生きていると見なす（その後は変化で判定）
          else seenAt = prev || now - p.lastSeen < 60000 ? now : p.lastSeen
          seen.current[k] = { lastSeen: p.lastSeen, seenAt }
          next[k] = { ...p, seenAt }
        }
        setAll(next)
      }),
    [],
  )
  return all
}

export function isOnline(p: PresenceDoc | undefined, now: number): boolean {
  return !!p && p.lastSeen !== 0 && now - (p.seenAt ?? p.lastSeen) < PRESENCE_TIMEOUT_MS
}

export function useTeamsAll(): Record<string, TeamDoc> {
  const [all, setAll] = useState<Record<string, TeamDoc>>({})
  useEffect(() => {
    const b = getBackend()
    // チーム番号の文書だけを見る。商品は items コレクション
    const unsubs = Array.from({ length: TEAM_COUNT }, (_, i) => {
      const id = String(i + 1)
      return b.watchDoc<TeamDoc>('teams', id, (d) => {
        setAll((prev) => ({ ...prev, [id]: d ?? DEFAULT_TEAM }))
      })
    })
    return () => unsubs.forEach((u) => u())
  }, [])
  return all
}

export function useTeam(team: number): [TeamDoc, (patch: Partial<TeamDoc>) => void, boolean] {
  const [doc, setDoc] = useState<TeamDoc | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(
    () =>
      getBackend().watchDoc<TeamDoc>('teams', String(team), (d) => {
        setDoc(d)
        setLoaded(true)
      }),
    [team],
  )
  const update = useCallback(
    (patch: Partial<TeamDoc>) => {
      // Firestore は undefined を入れられない（入れると保存が失敗する）ので、undefined の項目は落とす
      const clean = JSON.parse(JSON.stringify({ ...patch, updatedAt: Date.now() }))
      getBackend()
        .set('teams', String(team), clean)
        .catch(() => {})
    },
    [team],
  )
  return [{ ...DEFAULT_TEAM, ...(doc ?? {}) }, update, loaded]
}
