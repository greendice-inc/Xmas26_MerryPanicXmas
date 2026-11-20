import { useMemo, useSyncExternalStore } from 'react'
import { getBackend } from '../net'
import {
  CLEAR,
  ENDING,
  NOVEL,
  characterImage,
  masterElfImage,
  st2Silhouette,
  ST2_KIDS,
  DUMMY_IMAGE,
  type Emotion,
  type Mood,
  type NovelLine,
  type NovelScene,
} from '../scenario'
import * as G from './gameScenes'

/**
 * セリフ編集（?debug=true の /script）で作るデータ。
 * Firestore の script コレクションに、キャラ（char-*）・場面（scene-*）・音（sound-*）を1件ずつ入れる。
 * 保存されていないものは、コードに書かれた今のセリフ（scenario.ts）を使う。
 */

export const EMOTIONS: Emotion[] = ['喜', '怒', '哀', '楽', '真顔']

export interface ScriptChar {
  id: string
  /** 会話で表示する名前 */
  name: string
  /** 編集画面だけのメモ（シルエットなど、同じ名前のキャラを見分ける） */
  note?: string
  /** 表情ごとの立ち絵（public のパスか、アップロードした画像） */
  images: Partial<Record<Emotion, string>>
}

/** talk=セリフ / banner=画面中央の文字 / mood=キモチのダイアログ */
export type LineKind = 'talk' | 'banner' | 'mood'

export interface ScriptLine {
  id: string
  kind: LineKind
  char?: string
  /** 表示する名前（空ならキャラの名前。「？？？」「リン（心の声）」など） */
  name?: string
  /** ゲーム画面の会話の位置 */
  pos?: 'bottom' | 'top' | 'shop' | 'corner'
  emotion?: Emotion
  text: string
  size?: 'sm' | 'md' | 'lg'
  /** 効果音・音声。public のパスか「sound:<id>」 */
  se?: string
  voice?: string
  /** 音声が鳴り終わったら、タップを待たずに次の台詞へ（フルボイス用） */
  auto?: boolean
  /** 前の台詞の音声を止めずに流したまま、この台詞を出す（長台詞の音声を何行かに分けて見せるとき） */
  keepVoice?: boolean
  /** 台詞と一緒に中央へ出す画像。public のパスか「image:<id>」 */
  slide?: string
  image?: string
  mood?: Mood
}

export interface ScriptSound {
  id: string
  name: string
  data: string
}

/** セリフと一緒に画面の中央へ出す画像（アップロードしたもの）。セリフからは「image:<id>」で指す */
export type ScriptImage = ScriptSound

export interface SceneDef {
  id: string
  /** タブ（Stage1 など） */
  tab: string
  label: string
  base: NovelScene
  /** ゲーム画面の中で話す（上・下を選べる） */
  game?: boolean
  /** 決まった枠に出すので、上・下を選べない（マーク当ての下の枠） */
  noPos?: boolean
}

export const SCRIPT_TABS = ['Stage1', 'Stage2', 'Stage3', 'Stage4', 'StageF'] as const

const game = (id: string, tab: string, label: string, base: NovelScene, more: Partial<SceneDef> = {}): SceneDef => ({
  id,
  tab,
  label,
  base,
  game: true,
  ...more,
})

/** 編集できる場面。並びはゲームで出てくる順 */
export const SCENES: SceneDef[] = [
  { id: 'st1-intro', tab: 'Stage1', label: '導入', base: NOVEL[0] },
  game('st1-mark', 'Stage1', 'マーク当て中', G.ST1_MARK, { noPos: true }),
  game('st1-mark-miss1', 'Stage1', 'マーク当て：1回目の不正解', G.ST1_MARK_MISS_FIRST, { noPos: true }),
  game('st1-mark-miss', 'Stage1', 'マーク当て：2回目からの不正解', G.ST1_MARK_MISS, { noPos: true }),
  game('st1-rules', 'Stage1', 'マーク当てのあと（Santazonの説明）', G.ST1_RULES),
  game('st1-sock', 'Stage1', '正しい注文のあと（ソックスキー）', G.ST1_SOCK),
  { id: 'st1-clear', tab: 'Stage1', label: 'クリア後', base: CLEAR[0] },
  { id: 'st2-intro', tab: 'Stage2', label: '導入', base: NOVEL[1] },
  game('st2-tutorial', 'Stage2', 'リスト追加検索の案内', G.ST2_TUTORIAL),
  game('st2-miss', 'Stage2', '違う場所を選んだとき', G.ST2_MISS),
  game('st2-amy', 'Stage2', 'ラウンド1のあと（アミー）', G.ST2_AMY),
  game('st2-jimmy', 'Stage2', 'ラウンド2のあと（ジミー）', G.ST2_JIMMY),
  game('st2-tommy', 'Stage2', 'ダミーを選んだとき', G.ST2_TOMMY),
  { id: 'st2-clear', tab: 'Stage2', label: 'クリア後', base: CLEAR[1] },
  { id: 'st3-intro', tab: 'Stage3', label: '導入', base: NOVEL[2] },
  game('st3-rule', 'Stage3', 'ルール説明', G.ST3_RULE),
  game('st3-after-g1', 'Stage3', 'ラウンド1のあと', G.ST3_AFTER_G1),
  game('st3-after-g2', 'Stage3', 'ラウンド2のあと（部屋のお題）', G.ST3_AFTER_G2),
  game('st3-chair', 'Stage3', 'ナゾを解いたあと（イス）', G.ST3_CHAIR),
  { id: 'st3-clear', tab: 'Stage3', label: 'クリア後', base: CLEAR[2] },
  { id: 'st4-intro', tab: 'Stage4', label: '導入', base: NOVEL[3] },
  game('st4-tutorial', 'Stage4', 'チュートリアル（説明）', G.ST4_TUTORIAL),
  game('st4-tutorial-bingo', 'Stage4', 'ロビンのキモチのあと', G.ST4_TUTORIAL_BINGO),
  game('st4-jack', 'Stage4', '画面ジャックの説明', G.ST4_JACK),
  game('st4-r1-order', 'Stage4', 'ROUND1：とりよせのあと', G.ST4_R1_ORDER),
  game('st4-sock', 'Stage4', '取り出し依頼のあと', G.ST4_SOCK),
  game('st4-r1-start', 'Stage4', 'ROUND1：ゲーム開始', G.ST4_R1_START),
  game('st4-r1-end', 'Stage4', 'ROUND1のあと', G.ST4_R1_END),
  game('st4-r2-start', 'Stage4', 'ROUND2：ゲーム開始', G.ST4_R2_START),
  game('st4-r2-end', 'Stage4', 'ROUND2のあと', G.ST4_R2_END),
  { id: 'st5-intro', tab: 'StageF', label: 'LAST導入', base: NOVEL[4] },
  game('st5-basket', 'StageF', 'サッカーボールを発送できなかったとき', G.ST5_BASKET),
  game('st5-extract', 'StageF', '取り出し依頼のあと', G.ST5_EXTRACT),
  game('st5-again', 'StageF', '空になったあと、もう一度サッカーボールを発送したとき', G.ST5_AGAIN),
  game('st5-wrong', 'StageF', '最後の注文：金庫と変なものを発送しようとしたとき', G.ST5_WRONG),
  game('st5-final', 'StageF', '最後の注文（とりよせを押したとき）', G.ST5_FINAL),
  game('st5-balls', 'StageF', 'エントツとボールを発送したあと', G.ST5_BALLS),
  { id: 'st5-clear', tab: 'StageF', label: 'マスターエルフ', base: CLEAR[4] },
  game('st5-end1', 'StageF', '最後：ボールを入れる', G.ST5_END_1),
  game('st5-end2', 'StageF', '最後：勝者の発表', G.ST5_END_2),
]

/** ステージと場面（会話 / クリア / エンディング）から、編集できる場面の id */
export function sceneIdFor(stage: number, phase: 'novel' | 'clear' | 'end'): string | null {
  if (phase === 'end') return 'stF-ending'
  const id = `st${stage}-${phase === 'novel' ? 'intro' : 'clear'}`
  return SCENES.some((s) => s.id === id) ? id : null
}

const folderImages = (folder: string): ScriptChar['images'] =>
  Object.fromEntries(EMOTIONS.map((e) => [e, characterImage(folder, e)]))
const sameImage = (src: string): ScriptChar['images'] => Object.fromEntries(EMOTIONS.map((e) => [e, src]))

/** 今のコードにいるキャラ */
export const DEFAULT_CHARS: ScriptChar[] = [
  { id: 'elf', name: 'エルフ', note: '案内役', images: folderImages('Common') },
  { id: 'st1', name: 'リン', note: 'ステージ1', images: folderImages('Stage1') },
  {
    id: 'st2s',
    name: 'アミー・ジミー・トミー',
    note: 'ステージ2（シルエット）',
    images: Object.fromEntries(EMOTIONS.map((e) => [e, st2Silhouette(e)])),
  },
  { id: 'st2', name: 'アミー・ジミー・トミー', note: 'ステージ2', images: folderImages('Stage2') },
  { id: 'amy', name: 'アミー', note: 'ステージ2', images: sameImage(ST2_KIDS.amy.image) },
  { id: 'jimmy', name: 'ジミー', note: 'ステージ2', images: sameImage(ST2_KIDS.jimmy.image) },
  { id: 'tommy', name: 'トミー', note: 'ステージ2', images: sameImage(ST2_KIDS.tommy.image) },
  { id: 'dummy', name: 'ダミー', note: 'ステージ2（？）', images: sameImage(DUMMY_IMAGE) },
  { id: 'st3', name: 'カイ・メイ', note: 'ステージ3', images: folderImages('Stage3') },
  { id: 'st4', name: 'ロビン', note: 'ステージ4', images: folderImages('Stage4') },
  { id: 'stF', name: 'ルドリー', note: 'LAST', images: folderImages('StageF') },
  { id: 'master', name: 'マスターエルフ', note: 'LAST', images: Object.fromEntries(EMOTIONS.map((e) => [e, masterElfImage(e)])) },
]

const FOLDER_CHAR: Record<string, string> = {
  Common: 'elf',
  Stage1: 'st1',
  Stage2: 'st2',
  Stage3: 'st3',
  Stage4: 'st4',
  StageF: 'stF',
}

/** 立ち絵を直接指定している台詞のキャラ（シルエット・兄弟ひとりずつ・マスターエルフ） */
function charOfSrc(src: string | undefined): string | undefined {
  if (!src) return undefined
  if (src.includes('silhouette')) return 'st2s'
  if (src.includes('master_elf')) return 'master'
  if (src === DUMMY_IMAGE) return 'dummy'
  if (src === ST2_KIDS.amy.image) return 'amy'
  if (src === ST2_KIDS.jimmy.image) return 'jimmy'
  if (src === ST2_KIDS.tommy.image) return 'tommy'
  return undefined
}

export const newId = () => Math.random().toString(36).slice(2, 10)

/** コードに書かれた場面を、編集用の行にする */
export function linesFromScene(scene: NovelScene): ScriptLine[] {
  return scene.lines.map((l, i): ScriptLine => {
    // 演出が探す名前（gameScenes.ts の tag）があればそれを、無ければ番号から
    const id = l.id ?? `d${i}`
    if (l.mood) return { id, kind: 'mood', text: '', mood: l.mood }
    if (l.banner) return { id, kind: 'banner', text: l.banner }
    const folder = l.character ?? scene.character ?? ''
    const char = charOfSrc(l.charSrc) ?? FOLDER_CHAR[folder] ?? 'elf'
    const base = DEFAULT_CHARS.find((c) => c.id === char)
    return {
      id,
      kind: 'talk',
      char,
      // キャラの名前と違う表示名（？？？ など）は残す
      name: l.speaker && l.speaker !== base?.name ? l.speaker : undefined,
      pos: l.pos,
      emotion: l.emotion ?? '真顔',
      text: l.text,
      size: l.size,
      slide: l.slide,
      image: l.image,
      auto: l.auto,
      keepVoice: l.keepVoice,
    }
  })
}

/** 立ち絵。その表情が無ければ真顔、それも無ければ最初の1枚 */
export function charImage(c: ScriptChar | undefined, e: Emotion = '真顔'): string | undefined {
  if (!c) return undefined
  return c.images[e] || c.images['真顔'] || EMOTIONS.map((x) => c.images[x]).find(Boolean)
}

/** 名前（演出が探す id）の付いた行。セリフ編集では、消したり並べ替えたりできない */
export const isNamedLine = (def: SceneDef, id: string) => def.base.lines.some((l) => l.id === id)

export interface ScriptState {
  loaded: boolean
  chars: ScriptChar[]
  /** 保存済みの場面（無いものはコードのまま） */
  savedScenes: Record<string, ScriptLine[]>
  sounds: ScriptSound[]
  images: ScriptImage[]
  /** 保存済みのキャラ id */
  savedChars: Set<string>
}

type Doc =
  | ({ kind: 'char'; deleted?: boolean; order?: number } & ScriptChar)
  | { kind: 'scene'; lines: ScriptLine[] }
  | ({ kind: 'sound' } & ScriptSound)
  | ({ kind: 'image' } & ScriptImage)

const COL = 'script'

/**
 * script コレクションは、アプリ全体で1つだけ購読して共有する。
 * 画面ごとに購読すると、あとから出たゲーム画面が読み込み前（コードのセリフ）で会話を始めてしまうため
 */
let scriptDocs: Record<string, Doc> | null = null
let scriptStop: (() => void) | null = null
const scriptListeners = new Set<() => void>()
function subscribeScript(cb: () => void) {
  scriptListeners.add(cb)
  if (!scriptStop)
    scriptStop = getBackend().watchCol<Doc>(COL, (all) => {
      scriptDocs = all
      scriptListeners.forEach((l) => l())
    })
  return () => {
    scriptListeners.delete(cb)
  }
}

/** script コレクションを読む */
export function useScript(): ScriptState {
  const all = useSyncExternalStore(subscribeScript, () => scriptDocs)
  return useMemo(() => {
    const docs = all ?? {}
    const savedChars = new Set<string>()
    const charDocs = new Map<string, Doc & { kind: 'char' }>()
    const savedScenes: Record<string, ScriptLine[]> = {}
    const sounds: ScriptSound[] = []
    const images: ScriptImage[] = []
    for (const [key, d] of Object.entries(docs)) {
      if (!d) continue
      if (d.kind === 'char') {
        charDocs.set(d.id, d)
        savedChars.add(d.id)
      } else if (d.kind === 'scene' && Array.isArray(d.lines)) {
        // セリフは DB（保存したもの）が本体。コードのセリフは、まだ保存されていない場面の初期値
        savedScenes[key.replace(/^scene-/, '')] = d.lines
      } else if (d.kind === 'sound') sounds.push({ id: d.id, name: d.name, data: d.data })
      else if (d.kind === 'image') images.push({ id: d.id, name: d.name, data: d.data })
    }
    // 最初からいるキャラは保存で上書き。足したキャラは後ろに並べる
    const chars: ScriptChar[] = []
    for (const c of DEFAULT_CHARS) {
      const s = charDocs.get(c.id)
      if (s?.deleted) continue
      chars.push(s ? strip(s) : c)
    }
    const added = [...charDocs.values()]
      .filter((c) => !c.deleted && !DEFAULT_CHARS.some((d) => d.id === c.id))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    chars.push(...added.map(strip))
    sounds.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    images.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    return { loaded: !!all, chars, savedScenes, sounds, images, savedChars }
  }, [all])
}

function strip(d: ScriptChar & { kind?: string; deleted?: boolean; order?: number }): ScriptChar {
  return { id: d.id, name: d.name, note: d.note, images: d.images ?? {} }
}

export const saveChar = (c: ScriptChar, order: number) =>
  getBackend().set(COL, `char-${c.id}`, { kind: 'char', ...c, note: c.note ?? '', deleted: false, order, updatedAt: Date.now() })
/** 消す。最初からいるキャラは「消した」印を残す */
export const deleteChar = (id: string) =>
  DEFAULT_CHARS.some((c) => c.id === id)
    ? getBackend().set(COL, `char-${id}`, { kind: 'char', id, name: '', images: {}, deleted: true, updatedAt: Date.now() })
    : getBackend().remove(COL, `char-${id}`)
export const saveScene = (id: string, lines: ScriptLine[]) =>
  // Firestore は undefined を入れられないので、JSON を通して落とす
  getBackend().set(COL, `scene-${id}`, JSON.parse(JSON.stringify({ kind: 'scene', lines, updatedAt: Date.now() })))
/** 保存を消して、コードに書かれた初期のセリフに戻す */
export const resetScene = (id: string) => getBackend().remove(COL, `scene-${id}`)
export const saveSound = (s: ScriptSound) => getBackend().set(COL, `sound-${s.id}`, { kind: 'sound', ...s, updatedAt: Date.now() })
export const deleteSound = (id: string) => getBackend().remove(COL, `sound-${id}`)
export const saveImage = (s: ScriptImage) => getBackend().set(COL, `image-${s.id}`, { kind: 'image', ...s, updatedAt: Date.now() })

/** 「image:<id>」を表示できる URL にする（public のパスはそのまま） */
export function imageUrl(ref: string | undefined, images: ScriptImage[]): string | undefined {
  if (!ref) return undefined
  if (ref.startsWith('image:')) return images.find((s) => s.id === ref.slice(6))?.data
  return ref
}

/** 「sound:<id>」を再生できる URL にする */
export function soundUrl(ref: string | undefined, sounds: ScriptSound[]): string | undefined {
  if (!ref) return undefined
  if (ref.startsWith('sound:')) return sounds.find((s) => s.id === ref.slice(6))?.data
  return ref
}

/** 場面の行（保存済み or コード）を、ゲームで流す形にする */
export function toNovelScene(def: SceneDef, lines: ScriptLine[], chars: ScriptChar[], sounds: ScriptSound[], images: ScriptImage[] = []): NovelScene {
  return {
    background: def.base.background,
    character: def.base.character,
    lines: lines.map((l): NovelLine => {
      // 中央の画像は、セリフ・中央の文字・キモチのどれにも付けられる
      const extra = { se: soundUrl(l.se, sounds), voice: soundUrl(l.voice, sounds), slide: imageUrl(l.slide, images) }
      if (l.kind === 'mood' && l.mood) return { id: l.id, speaker: '', text: '', mood: l.mood, ...extra }
      if (l.kind === 'banner') return { id: l.id, speaker: '', text: '', banner: l.text, ...extra }
      const c = chars.find((x) => x.id === l.char)
      return {
        id: l.id,
        speaker: l.name || c?.name || '',
        pos: l.pos,
        text: l.text,
        emotion: l.emotion,
        size: l.size,
        charSrc: charImage(c, l.emotion),
        image: l.image,
        auto: l.auto,
        keepVoice: l.keepVoice,
        ...extra,
      }
    }),
  }
}

export const sceneLines = (id: string, state: ScriptState): ScriptLine[] => {
  const def = SCENES.find((s) => s.id === id)
  return state.savedScenes[id] ?? (def ? linesFromScene(def.base) : [])
}

/**
 * ゲームで流す場面。セリフ編集で場面かキャラを保存していれば、そちらから作る。
 * どちらも無ければ null（コードのまま）
 */
export function useScriptScene(stage: number, phase: 'novel' | 'clear' | 'end' | 'game'): NovelScene | null {
  const state = useScript()
  return useMemo(() => {
    if (phase === 'game') return null
    const id = sceneIdFor(stage, phase)
    const def = SCENES.find((s) => s.id === id)
    if (!def || !id) return null
    if (!state.savedScenes[id] && state.savedChars.size === 0) return null
    return toNovelScene(def, sceneLines(id, state), state.chars, state.sounds, state.images)
  }, [state, stage, phase])
}

/** ゲーム画面の中のセリフ。DB に保存していればそちら、まだ保存していない場面は gameScenes.ts の初期値 */
export function useGameLines(id: string): NovelLine[] {
  const state = useScript()
  return useMemo(() => {
    const def = SCENES.find((s) => s.id === id)
    if (!def) return []
    if (!state.savedScenes[id] && state.savedChars.size === 0) return def.base.lines
    return toNovelScene(def, sceneLines(id, state), state.chars, state.sounds, state.images).lines
  }, [state, id])
}

/** 名前（tag の id）で行の番号を探す。無ければ -1（その行が無い場面では、演出もかからない） */
export const lineIndex = (lines: NovelLine[], id: string) => lines.findIndex((l) => l.id === id)

/**
 * コードの初期セリフを、まだ DB に無い場面だけ DB に書き込む（一度書けば、以後は DB が本体）。
 * 書き込んだ場面の数を返す
 */
export async function seedScenes(state: ScriptState): Promise<number> {
  const todo = SCENES.filter((s) => !state.savedScenes[s.id])
  await Promise.all(todo.map((s) => saveScene(s.id, linesFromScene(s.base))))
  return todo.length
}
