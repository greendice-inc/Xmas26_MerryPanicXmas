import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import AreaEditor from '../components/AreaEditor'
import type { SzGuide, SzTab } from '../components/Santazon'
import { useProducts } from '../santazon/useProducts'
import GameTalk, { hl } from '../components/GameTalk'
import { lineImage } from '../script/gameScenes'
import { RECORDS, ST2_KIDS, st2GameImage, type NovelLine } from '../scenario'
import { useGameLines } from '../script/scriptData'
import type { HideProgress, TeamDoc } from '../types'
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

/** 案内が求める操作。tap=タップで次へ / shop=注文を開く / tab=リスト登録タブを押す / search=マネキンを検索する */
type Wait = 'tap' | 'shop' | 'tab' | 'search'

/** リスト追加検索の案内（st2-tutorial）の、行ごとの演出。書いていない行はタップで次へ */
const TUTORIAL_FX: Record<number, { wait: Wait; card?: 'show' | 'fly' }> = {
  4: { wait: 'shop' },
  5: { wait: 'tab' },
  8: { wait: 'tap', card: 'fly' },
  9: { wait: 'search' },
}
const fxOf = (i: number) => TUTORIAL_FX[i] ?? { wait: 'tap' as Wait }
const SHOP_STEP = 4
const TAB_STEP = 5
const SEARCH_STEP = 9
/** 案内のこの行（アミーのヒント）は、ラウンド1のあいだ右上に小さく出しておく */
const CORNER_HINT = 11

/** 見つけられたあとの台詞（st2-amy など）。hint は右下のアイコン（アミー）から聞き直せる質問の行、banner は台詞のあとに出す */
const FOUND: Record<'amy' | 'jimmy' | 'tommy', { scene: string; hint: number[]; banner?: string }> = {
  amy: { scene: 'st2-amy', hint: [6, 7, 8, 9, 10], banner: 'ラウンド2　ジミーを見つけよう。' },
  jimmy: { scene: 'st2-jimmy', hint: [5, 6, 7, 8], banner: 'ラウンド3　トミーを見つけよう。' },
  tommy: { scene: 'st2-tommy', hint: [] },
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
}

/** ステージ2：かくれんぼ。ゲーム画面の隠れ場所をタップして三兄弟を見つける */
export default function HideSeek({ doc, update, shopOpen, szTab, onGuide, onAllFound }: Props) {
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
  const [goal, setGoal] = useState(false)
  const tutorial = !hide.tutorialDone
  const tutorialLines = useGameLines('st2-tutorial')
  const foundLines = { amy: useGameLines('st2-amy'), jimmy: useGameLines('st2-jimmy'), tommy: useGameLines('st2-tommy') }
  const missLines = useGameLines('st2-miss')
  const lineText = tutorial ? tutorialLines[step] : undefined
  const line = lineText ? { ...fxOf(step), talk: lineText } : undefined

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
    if (line.wait === 'search' && searchedNames.has('マネキン')) setStep(step + 1)
  })

  // 途中で Santazon を閉じたら、開くところからやり直す
  useEffect(() => {
    // マネキンを検索するまで。そのあとは自由に閉じてよい
    if (!tutorial || step <= SHOP_STEP || step > SEARCH_STEP) return
    if (!shopOpen) setStep(SHOP_STEP)
    else if (step > TAB_STEP && szTab !== 'search') setStep(TAB_STEP)
  }, [tutorial, step, shopOpen, szTab])

  // リスト追加検索のタブは、押すように言うところで出てくる
  useEffect(() => {
    if (tutorial && step >= TAB_STEP && !doc.searchUnlocked) update({ searchUnlocked: true })
  }, [tutorial, step, doc.searchUnlocked, update])

  useEffect(() => {
    onGuide({
      menu: !!line && line.wait === 'shop',
      // 検索してもらう行と、検索のあとは、Santazon を触れる
      sz: line?.wait === 'tab' ? 'tab' : line && step > TAB_STEP && step < SEARCH_STEP ? 'talk' : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.wait, step, onGuide])
  useEffect(() => () => onGuide({ menu: false, sz: null }), [onGuide])

  const tapTutorial = () => {
    if (!line || line.wait !== 'tap') return
    if (line.card === 'fly') {
      const records = doc.records ?? []
      if (!records.includes(CARD_ID)) update({ records: [...records, CARD_ID] })
    }
    if (step + 1 < tutorialLines.length) setStep(step + 1)
    else {
      update({ hide: { ...hide, tutorialDone: true } })
      setGoal(true)
    }
  }

  // カードが「記録」ボタンへ飛んでいく先（プレイヤー画面の座標）
  const [flyTo, setFlyTo] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (line?.card !== 'fly' || !host) return setFlyTo(null)
    const btn = host.querySelector<HTMLElement>('[data-menu="記録"]')
    if (!btn) return setFlyTo(null)
    const r = host.getBoundingClientRect()
    const s = r.width / host.offsetWidth
    const b = btn.getBoundingClientRect()
    setFlyTo({ x: (b.left + b.width / 2 - r.left) / s - host.offsetWidth / 2, y: (b.top + b.height / 2 - r.top) / s - host.offsetHeight / 2 })
    // line は描画のたびに作り直すので、行の番号で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.card, step, host])

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
    if (!ready && found > 0) return setElfSays(missLines[0])
    if (!ready || area.role !== target.role) return setElfSays(missLines[1])
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
  const replayHint = () => {
    if (!lastKid) return
    const hint = FOUND[lastKid].hint.map((i) => foundLines[lastKid][i]).filter(Boolean)
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
          aspect="1980 / 1200"
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
      {!editing && !tutorial && found === 0 && tutorialLines[CORNER_HINT] && (
        <div className="hide-corner-hint">
          <p>{hl(tutorialLines[CORNER_HINT].text)}</p>
          <img src={lineImage(tutorialLines[CORNER_HINT])} alt="" />
        </div>
      )}

      {!editing && !tutorial && (
        <>
          {lastKid && (
            <button className="hide-kid-icon" onClick={replayHint} aria-label="アミーへの質問をもう一度聞く">
              <img src={ST2_KIDS.amy.image} alt="" />
            </button>
          )}
          {lastKid && <span className="hide-kid-label">質問をもう一度聞く</span>}
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
            {line.card && (
              <img
                key={line.card}
                className={`hide-card${line.card === 'fly' ? ' is-fly' : ''}`}
                src={RECORDS[CARD_ID].image}
                alt=""
                style={flyTo ? { ['--fx' as string]: `${flyTo.x}px`, ['--fy' as string]: `${flyTo.y}px` } : undefined}
              />
            )}
            <GameTalk key={step} line={line.talk} compact={compact} wait={line.wait !== 'tap'} />
          </>,
        )}

      {goal &&
        overlay(
          <div className="hide-goal-back">
            <div className="hide-goal">
              <p>ラウンド1　アミーを見つけよう！</p>
              <button onClick={() => setGoal(false)}>OK</button>
            </div>
          </div>,
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
            <GameTalk key={`${talk.role}${talk.idx}`} line={talk.lines[talk.idx]} compact={compact} />
          </>,
        )}
    </div>
  )
}
