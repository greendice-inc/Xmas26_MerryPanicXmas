import type { TeamDoc } from './types'

/**
 * スタッフ画面の進捗バーが右に出すシーン名。シーンジャンプの行き先（HiddenMenu の JUMP_STAGES）と同じ並び。
 * big=ステージの頭（会話）。
 */
export interface SceneNode {
  label: string
  big?: boolean
}

export const SCENE_NODES: SceneNode[] = [
  // ステージ1 わなげ
  { label: 'わなげ 会話', big: true },
  { label: 'わなげ マーク' },
  { label: 'わなげ 輪投げ' },
  { label: 'わなげ END' },
  // ステージ2 かくれんぼ
  { label: 'かくれんぼ 会話', big: true },
  { label: 'かくれんぼ 一人目' },
  { label: 'かくれんぼ 二人目' },
  { label: 'かくれんぼ 三人目' },
  { label: 'かくれんぼ END' },
  // ステージ3 ツイスター
  { label: 'ツイスター 会話', big: true },
  { label: 'ツイスター T1' },
  { label: 'ツイスター T2' },
  { label: 'ツイスター T3' },
  { label: 'ツイスター END' },
  // ステージ4 ビンゴ
  { label: 'ビンゴ 会話', big: true },
  { label: 'ビンゴ B1' },
  { label: 'ビンゴ B2' },
  { label: 'ビンゴ END' },
  // ステージ5 エントツ
  { label: 'エントツ 会話', big: true },
  { label: 'エントツ サッカー' },
  { label: 'エントツ 取り出し' },
  { label: 'エントツ 煙突' },
  { label: 'エントツ 緊急' },
  { label: 'エントツ ラスト' },
  // クリア後
  { label: 'クリア後 会話', big: true },
]

/** 各ステージの先頭（会話）の位置 */
const STAGE_START = [0, 4, 9, 14, 18]
const END_INDEX = 24

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
      step = Math.max(1, ['rule', 'g1', 'g2', 'room'].indexOf(t.word?.step ?? 'rule'))
      break
    case 4:
      step = Math.max(1, ['rule', 'r1', 'r2'].indexOf(t.bingo?.step === 'done' ? 'r2' : (t.bingo?.step ?? 'rule')))
      break
    case 5: {
      const s = t.last?.step ?? 'basket'
      step = 1 + Math.max(0, ['basket', 'extract', 'balls', 'notice', 'super'].indexOf(s))
      break
    }
  }
  return Math.min(start + step, lastOfStage)
}
