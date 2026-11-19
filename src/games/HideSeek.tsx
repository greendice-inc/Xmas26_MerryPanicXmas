import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import AreaEditor from '../components/AreaEditor'
import type { SzGuide, SzTab } from '../components/Santazon'
import { useProducts } from '../santazon/useProducts'
import GameTalk, { hl } from '../components/GameTalk'
import { SPOTS, Spotlight } from './Stage1Guide'
import { lineImage } from '../script/gameScenes'
import { RECORDS, ST2_KIDS, st2GameImage, type NovelLine } from '../scenario'
import { lineIndex, useGameLines } from '../script/scriptData'
import type { HideProgress, TeamDoc } from '../types'
import { GuideArrow } from './Stage1Guide'
import {
  areasToCode,
  resetHideAreas,
  ROLE_LABEL,
  saveHideAreas,
  useHideAreas,
  type HideArea,
  type HideRole,
} from './hideAreas'

/** 「みーつけた！」を見せる長さ */
const FOUND_MS = 1800
const CARD_ID = 'st2-card'
/** 「リスト登録のタブを押しましょう。」を話し始めるまでの間 */
const TAB_DELAY_MS = 900

/** 案内が求める操作。tap=タップで次へ / shop=注文を開く / tab=リスト登録タブを押す / search=マネキンを検索する */
type Wait = 'tap' | 'shop' | 'tab' | 'search'

/** リスト追加検索の案内（st2-tutorial）の、行ごとの演出。行の名前は script/gameScenes.ts の tag。書いていない行はタップで次へ */
const TUTORIAL_FX: Record<string, { wait: Wait; card?: 'show' }> = {
  'open-shop': { wait: 'shop' },
  tab: { wait: 'tab' },
  'mannequin-card': { wait: 'tap', card: 'show' },
  search: { wait: 'search' },
}
const fxOf = (id?: string) => TUTORIAL_FX[id ?? ''] ?? { wait: 'tap' as Wait }
/** 案内のこの行（アミーのヒント）は、ラウンド1のあいだ右上に小さく出しておく */
const CORNER_HINT = 'corner-hint'

/** 見つけられたあとの台詞（st2-amy など）。hint は右下のアイコン（アミー）から聞き直せる質問の行（hint-from〜hint-to の行）、banner は台詞のあとに出す */
const FOUND: Record<'amy' | 'jimmy' | 'tommy', { scene: string; hint: boolean; banner?: string }> = {
  amy: { scene: 'st2-amy', hint: true, banner: 'ラウンド2　ジミーを見つけよう。' },
  jimmy: { scene: 'st2-jimmy', hint: true, banner: 'ラウンド3　トミーを見つけよう。' },
  tommy: { scene: 'st2-tommy', hint: false },
}

/** 見つけた人数 → 次に探す子と、その子が正解になる条件の商品 */
/** 最後の正解はトミーではなくダミー（引っかかる）。そのあとトミーが出てくる */
const TARGETS: { role: 'amy' | 'jimmy' | 'dummy'; item: string }[] = [
  { role: 'amy', item: 'マネキン' },
  { role: 'jimmy', item: 'セーター' },
  { role: 'dummy', item: 'オーバーオール' },
]

interface Props {
  doc: TeamDoc
  update: (patch: Partial<TeamDoc>) => void
  shopOpen: boolean
  szTab: SzTab
  /** 案内で目立たせる場所（注文ボタン・Santazon の中） */
  onGuide: (g: { menu: boolean; sz: SzGuide | null }) => void
  /** トミーまで見つけて、最後の台詞を読み終えた */
  onAllFound: () => void
  /** 説明の最後（「ラウンド1、スタートです！」）のあと：暗くして Santazon を閉じ、ゲーム画面へ */
  onTutorialEnd: (then: () => void) => void
}

/** ステージ2：かくれんぼ。ゲーム画面の隠れ場所をタップして三兄弟を見つける */
export default function HideSeek({ doc, update, shopOpen, szTab, onGuide, onAllFound, onTutorialEnd }: Props) {
  const { products } = useProducts()
  const { areas, saved } = useHideAreas()
  const hide: HideProgress = { tutorialDone: false, found: 0, ...doc.hide }
  const found = Math.min(3, hide.found)
  const debug = new URLSearchParams(location.search).get('debug') === 'true'

  // 検索済みリストに入っている商品の名前
  const searchedNames = new Set(doc.searched.map((id) => products.find((p) => p.id === id)?.name).filter(Boolean))

  // ---------- エルフの案内 ----------
  const [step, setStep] = useState(0)
  // 案内が終わったあと、真ん中に出す「やること」のダイアログ
  const tutorial = !hide.tutorialDone
  const tutorialLines = useGameLines('st2-tutorial')
  const foundLines = { amy: useGameLines('st2-amy'), jimmy: useGameLines('st2-jimmy'), tommy: useGameLines('st2-tommy') }
  const missLines = useGameLines('st2-miss')
  const cornerHint = tutorialLines.find((l) => l.id === CORNER_HINT)
  const lineText = tutorial ? tutorialLines[step] : undefined
  const line = lineText ? { ...fxOf(lineText.id), talk: lineText } : undefined
  // 「リスト登録のタブを押しましょう。」は、Santazon の画面が出てから、ちょっと置いて話し始める
  const [tabReady, setTabReady] = useState(false)
  useEffect(() => {
    if (line?.wait !== 'tab') return setTabReady(false)
    const t = setTimeout(() => setTabReady(true), TAB_DELAY_MS)
    return () => clearTimeout(t)
  }, [line?.wait, line?.talk.id])
  const talkHeld = line?.wait === 'tab' && !tabReady
  // 演出の節目の行（名前で探す）。行を足したり並べ替えても、番号はここで取り直す
  const SHOP_STEP = lineIndex(tutorialLines, 'open-shop')
  const TAB_STEP = lineIndex(tutorialLines, 'tab')
  const SEARCH_STEP = lineIndex(tutorialLines, 'search')
  const stepsOk = SHOP_STEP >= 0 && TAB_STEP > SHOP_STEP && SEARCH_STEP > TAB_STEP

  // 画面の外（注文ボタン）まで覆うため、案内などはプレイヤー画面の上に出す
  const [host, setHost] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setHost(rootRef.current?.closest<HTMLElement>('.screen.player') ?? null)
  }, [])

  // 操作を待つ台詞は、その操作がされたら次へ
  useEffect(() => {
    if (!line) return
    if (line.wait === 'shop' && shopOpen) setStep(step + 1)
    if (line.wait === 'tab' && shopOpen && szTab === 'search') setStep(step + 1)
    // 検索した結果を閉じて、リスト画面に戻ったら次へ
    if (line.wait === 'search' && searchedNames.has('マネキン') && szTab === 'list') setStep(step + 1)
  })

  // 途中で Santazon を閉じたら、開くところからやり直す
  useEffect(() => {
    // マネキンを検索するまで。そのあとは自由に閉じてよい
    if (!tutorial || !stepsOk || step <= SHOP_STEP || step > SEARCH_STEP) return
    if (!shopOpen) setStep(SHOP_STEP)
    else if (step > TAB_STEP && szTab !== 'search' && !searchedNames.has('マネキン')) setStep(TAB_STEP)
  }, [tutorial, step, shopOpen, szTab])

  // リスト追加検索のタブは、押すように言うところで出てくる
  useEffect(() => {
    if (tutorial && stepsOk && step >= TAB_STEP && !doc.searchUnlocked) update({ searchUnlocked: true })
  }, [tutorial, step, doc.searchUnlocked, update])

  useEffect(() => {
    onGuide({
      menu: !!line && line.wait === 'shop',
      // 検索してもらう行と、検索のあとは、Santazon を触れる
      sz: !stepsOk ? null : line?.wait === 'tab' ? 'tab' : line && step === SEARCH_STEP ? 'drag2' : line?.talk.id === 'searched-list' ? 'searched' : line && step > TAB_STEP && step < SEARCH_STEP ? 'talk' : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.wait, step, onGuide])
  useEffect(() => () => onGuide({ menu: false, sz: null }), [onGuide])

  const tapTutorial = () => {
    if (!line || line.wait !== 'tap') return
    if (line.card) {
      const records = doc.records ?? []
      if (!records.includes(CARD_ID)) update({ records: [...records, CARD_ID] })
    }
    if (step + 1 < tutorialLines.length) setStep(step + 1)
    // 最後の台詞のあとは、ダイアログを出さずに、フェードでゲーム画面へ
    else onTutorialEnd(() => update({ hide: { ...hide, tutorialDone: true } }))
  }

  // ---------- 見つける ----------
  const [elfSays, setElfSays] = useState<NovelLine | null>(null)
  const [celebrate, setCelebrate] = useState<HideArea | null>(null)
  const [talk, setTalk] = useState<{ role: 'amy' | 'jimmy' | 'tommy'; lines: NovelLine[]; idx: number; banner?: string } | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  // トミーまで見つけた状態で入り直したら、最後の台詞からやり直す
  useEffect(() => {
    if (found >= 3 && !talk) setTalk({ role: 'tommy', lines: foundLines.tommy, idx: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 見つけた子の場所は消す
  const foundRoles = new Set<string>(TARGETS.slice(0, found).map((t) => t.role))
  if (found >= 3) foundRoles.add('tommy')
  const visibleAreas = areas.filter((a) => !foundRoles.has(a.role))

  const pick = (area: HideArea) => {
    if (tutorial || celebrate || talk || found >= 3) return
    const target = TARGETS[found]
    const ready = searchedNames.has(target.item)
    const miss = (id: string, fallback: number) => missLines.find((l) => l.id === id) ?? missLines[fallback]
    if (!ready && found > 0) return setElfSays(miss('unsure', 0))
    if (!ready || area.role !== target.role) return setElfSays(miss('wrong', 1))
    if (target.role === 'dummy') {
      // ダミーも、ほかの子と同じ「みーつけた！」。そのあと発表
      setCelebrate(area)
      setTimeout(() => {
        setCelebrate(null)
        update({ hide: { ...hide, found: found + 1 } })
        setTalk({ role: 'tommy', lines: foundLines.tommy, idx: 0 })
      }, FOUND_MS)
      return
    }
    const role = target.role
    setCelebrate(area)
    setTimeout(() => {
      setCelebrate(null)
      update({ hide: { ...hide, found: found + 1 } })
      setTalk({ role, lines: foundLines[role], idx: 0, banner: FOUND[role].banner })
    }, FOUND_MS)
  }

  const nextTalk = () => {
    if (!talk) return
    if (talk.idx + 1 < talk.lines.length) return setTalk({ ...talk, idx: talk.idx + 1 })
    endTalk()
  }
  // セリフ編集で台詞を全部消した場面は、すぐ終わる
  useEffect(() => {
    if (talk && !talk.lines[talk.idx]) endTalk()
  })
  const endTalk = () => {
    if (!talk) return
    setTalk(null)
    if (talk.banner) setBanner(talk.banner)
    if (talk.role === 'tommy') onAllFound()
  }

  // 右下のアイコン：最後に見つけた子（トミーは除く）
  const lastKid = found === 1 ? 'amy' : found === 2 ? 'jimmy' : null
  // アイコンは、「もう一度聞きたい場合は右下のアイコンを〜」と言ったあとの行から出す（最初に聞いている間だけ）
  const iconAt = lastKid ? lineIndex(foundLines[lastKid], 'icon-hint') : -1
  const iconHidden = !!talk && !!lastKid && talk.lines === foundLines[lastKid] && iconAt >= 0 && talk.idx <= iconAt
  const replayHint = () => {
    if (!lastKid) return
    const all = foundLines[lastKid]
    const from = lineIndex(all, 'hint-from')
    const to = lineIndex(all, 'hint-to')
    const hint = FOUND[lastKid].hint && from >= 0 && to >= from ? all.slice(from, to + 1) : []
    if (hint.length) setTalk({ role: lastKid, lines: hint, idx: 0 })
  }

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 3000)
    return () => clearTimeout(t)
  }, [banner])

  // ---------- エリア編集（?debug=true） ----------
  const [editing, setEditing] = useState(false)

  const overlay = (node: ReactNode) => (host ? createPortal(node, host) : null)
  const compact = shopOpen

  return (
    <div className="hide-seek" ref={rootRef}>
      {editing ? (
        <AreaEditor
          areas={areas}
          saved={saved}
          image={st2GameImage(found)}
          aspect="1920 / 1200"
          boxLabel={(a) => `${a.label}（${ROLE_LABEL[a.role]}）`}
          boxClass={(a) => `role-${a.role}`}
          fields={(sel, edit) => (
            <label>
              隠れている子
              <select value={sel.role} onChange={(e) => edit({ role: e.target.value as HideRole })}>
                {(Object.keys(ROLE_LABEL) as HideRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
          )}
          onSave={saveHideAreas}
          onReset={resetHideAreas}
          toCode={areasToCode}
          codeHint="hideAreas.ts の DEFAULT_HIDE_AREAS に貼れます"
          onClose={() => setEditing(false)}
        />
      ) : (
        <div className="hide-stage">
          <img className="hide-bg" src={st2GameImage(found)} alt="" />
          {visibleAreas.map((a) => (
            <button
              key={a.id}
              className={`hide-area${debug ? ' is-debug' : ''}`}
              style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}
              aria-label={a.label}
              onClick={() => pick(a)}
            >
              {debug && <span>{a.label}（{ROLE_LABEL[a.role]}）</span>}
            </button>
          ))}
          {celebrate && (
            <div
              className="hide-found"
              style={{ left: `${celebrate.x + celebrate.w / 2}%`, top: `${celebrate.y + celebrate.h / 2}%` }}
            >
              <div className="hide-found-ring" />
              <div className="hide-found-text">みーつけた！</div>
            </div>
          )}
        </div>
      )}

      {/* ラウンド1（アミーを見つけるまで）、エルフのヒントを右上に小さく出しておく */}
      {!editing && !tutorial && found === 0 && cornerHint && (
        <div className="hide-corner-hint">
          <p>{hl(cornerHint.text)}</p>
          <img src={lineImage(cornerHint)} alt="" />
        </div>
      )}

      {!editing && !tutorial && (
        <>
          {lastKid && !iconHidden && (
            <button className="hide-kid-icon" onClick={replayHint} aria-label="アミーへの質問をもう一度聞く">
              <img src={ST2_KIDS.amy.image} alt="" />
            </button>
          )}
          {lastKid && !iconHidden && <span className="hide-kid-label">質問をもう一度聞く</span>}
        </>
      )}

      {debug && !tutorial && (
        <button className="hide-edit-btn" onClick={() => setEditing((e) => !e)}>
          {editing ? 'ゲームに戻る' : 'エリア編集'}
        </button>
      )}

      {banner && (
        <div className="hide-banner" key={banner} onClick={() => setBanner(null)}>
          {banner}
        </div>
      )}


      {line &&
        overlay(
          <>
            {line.wait === 'tap' && <div className="hide-catch" onClick={tapTutorial} />}
            {/* 「リスト登録」タブ（x=1360〜1880、y=20〜140）だけ明るくして、下から指す */}
            {line.wait === 'tab' && !talkHeld && <Spotlight rect={{ x: 1360, y: 20, w: 520, h: 120 }} pass />}
            {line.wait === 'tab' && !talkHeld && <GuideArrow key="tab-arrow" x={1620} y={146} up />}
            {line.card && <img key={line.card} className="hide-card" src={RECORDS[CARD_ID].image} alt="" />}
            {line.wait === 'search' ? (
              // 検索してもらう行は、しゃべらせず、右上にダイアログだけ出しておく
              <div className="hide-search-dialog">{hl(line.talk.text)}</div>
            ) : (
              <>
                {/* 「まずは左下のボタンでsantazonを開いて……」：santazon のボタンだけ明るく見せる */}
                {line.wait === 'shop' && <Spotlight rect={SPOTS.menuOrder} pass />}
                {!talkHeld && <GameTalk line={line.talk} compact={compact} wide wait={line.wait !== 'tap'} dim={line.wait !== 'shop' && line.wait !== 'tab'} />}
              </>
            )}
          </>,
        )}

      {elfSays &&
        overlay(
          <>
            <div className="hide-catch" onClick={() => setElfSays(null)} />
            <GameTalk line={elfSays} compact={compact} />
          </>,
        )}

      {talk?.lines[talk.idx] &&
        overlay(
          <>
            <div className="hide-catch" onClick={nextTalk} />
            <GameTalk line={talk.lines[talk.idx]} compact={compact} />
          </>,
        )}
    </div>
  )
}
