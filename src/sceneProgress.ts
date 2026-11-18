import type { TeamDoc } from './types'

/**
 * スタッフ画面の進捗バーの菱形。シーンジャンプの行き先（HiddenMenu の JUMP_GAMES）と同じ並び。
 * big=ステージの頭（会話）。
 */
export interface SceneNode {
  label: string
  big?: boolean
}

export const SCENE_NODES: SceneNode[] = [
  // ステージ1
  { label: '1 会話', big: true },
  { label: '1 マーク' },
  { label: '1 輪投げ' },
  // ステージ2
  { label: '2 会話', big: true },
  { label: '2 開始' },
  { label: '2 アミー後' },
  { label: '2 ジミー後' },
  { label: '2 トミー後' },
  // ステージ3
  { label: '3 会話', big: true },
  { label: '3 説明' },
  { label: '3 ゲーム1' },
  { label: '3 ゲーム2' },
  { label: '3 お題' },
  // ステージ4
  { label: '4 会話', big: true },
  { label: '4 説明' },
  { label: '4 ROUND1' },
  { label: '4 ROUND2' },
  // LAST
  { label: 'LAST 会話', big: true },
  { label: 'LAST 開始' },
  { label: 'LAST 取り出し後' },
  { label: 'LAST 重要通知' },
  { label: 'LAST マスター後' },
  // エンディング
  { label: 'エンディング', big: true },
]

/** 各ステージの先頭（会話）の位置 */
const STAGE_START = [0, 3, 8, 13, 17]
const END_INDEX = 22

/** いま居るシーンの位置（SCENE_NODES の添字）。未開始は -1 */
export function sceneIndex(t: TeamDoc): number {
  if (!t.started) return -1
  if (t.phase === 'end') return END_INDEX
  const start = STAGE_START[t.stage - 1] ?? 0
  const next = STAGE_START[t.stage] ?? END_INDEX
  const lastOfStage = next - 1
  if (t.phase === 'novel') return start
  // クリア後のお礼は、そのステージの最後のシーンのつづき
  if (t.phase === 'clear') return lastOfStage
  let step = 1
  switch (t.stage) {
    case 1:
      step = t.markCleared ? 2 : 1
      break
    case 2:
      step = t.hide?.found ? 1 + t.hide.found : 1
      break
    case 3:
      step = 1 + Math.max(0, ['rule', 'g1', 'g2', 'room'].indexOf(t.word?.step ?? 'rule'))
      break
    case 4:
      step = 1 + Math.max(0, ['rule', 'r1', 'r2'].indexOf(t.bingo?.step === 'done' ? 'r2' : (t.bingo?.step ?? 'rule')))
      break
    case 5: {
      const s = t.last?.step ?? 'basket'
      step = s === 'extract' ? 1 : 1 + Math.max(0, ['basket', 'balls', 'notice', 'super'].indexOf(s))
      break
    }
  }
  return Math.min(start + step, lastOfStage)
}
