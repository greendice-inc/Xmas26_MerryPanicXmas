import type { JumpTarget, Phase } from './types'

/**
 * プレビュー（?preview）：Figma に取り込むため、タブレットの画面を1つの場面から開く。
 * - チームの進行は、この端末の中だけ（メモリ）に置き、Firestore には書かない（セリフ・商品は Firestore から読む）
 * - チーム1として入り、拡縮せず 1920x1200 のまま表示する
 * - &scene=1-game-quiz のように、ステージ-場面[-行き先] で始める場面を選ぶ（シーンジャンプと同じ行き先）。end はクリア後
 */
const params = new URLSearchParams(location.search)
export const PREVIEW = params.has('preview')

export function previewTarget(): JumpTarget {
  const scene = params.get('scene') ?? '1-novel'
  if (scene === 'end') return { stage: 5, phase: 'end' }
  const [stage, phase, step] = scene.split('-')
  return { stage: Number(stage) || 1, phase: (phase as Phase) || 'novel', step: step as JumpTarget['step'] }
}
