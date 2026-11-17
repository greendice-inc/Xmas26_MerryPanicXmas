import { useState } from 'react'
import type { Area } from '../games/configAreas'
import { kidsRoomAreasToCode, resetKidsRoomAreas, saveKidsRoomAreas, useKidsRoomAreas } from '../games/kidsRoomAreas'
import AreaEditor from './AreaEditor'

const ROOM = `${import.meta.env.BASE_URL}BG/Stage1/st1_子供部屋.png`
const IMG_W = 1920
const IMG_H = 1200

/** 拡大して見せる窓の大きさ */
const VIEW_W = 1100
const VIEW_H = 740

/** ステージ1（輪投げ）のゲーム画面。決めた場所をタップすると、そのあたりを中央に拡大する（?debug=true でエリア編集） */
export default function KidsRoom() {
  const { areas, saved } = useKidsRoomAreas()
  const [spot, setSpot] = useState<Area | null>(null)
  const [editing, setEditing] = useState(false)
  const debug = new URLSearchParams(location.search).get('debug') === 'true'

  if (editing) {
    return (
      <div className="kids-room">
        <AreaEditor
          areas={areas}
          saved={saved}
          image={ROOM}
          aspect={`${IMG_W} / ${IMG_H}`}
          boxLabel={(a) => a.label}
          onSave={saveKidsRoomAreas}
          onReset={resetKidsRoomAreas}
          toCode={kidsRoomAreasToCode}
          codeHint="kidsRoomAreas.ts の DEFAULT_KIDS_ROOM_AREAS に貼れます"
          onClose={() => setEditing(false)}
        />
      </div>
    )
  }

  // 枠がちょうど窓に収まる大きさで、枠の真ん中を窓の中央に置く
  const zoom = (a: Area) => {
    const w = (a.w / 100) * IMG_W
    const h = (a.h / 100) * IMG_H
    const scale = Math.min(VIEW_W / w, VIEW_H / h)
    const cx = ((a.x + a.w / 2) / 100) * IMG_W
    const cy = ((a.y + a.h / 2) / 100) * IMG_H
    return { width: IMG_W * scale, height: IMG_H * scale, marginLeft: VIEW_W / 2 - cx * scale, marginTop: VIEW_H / 2 - cy * scale }
  }

  return (
    <div className="kids-room">
      <img className="kids-room-bg" src={ROOM} alt="" />
      {areas.map((a) => (
        <button
          key={a.id}
          className={`room-area${debug ? ' is-debug' : ''}`}
          style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}
          aria-label={`${a.label}を拡大する`}
          onClick={() => setSpot(a)}
        >
          {debug && <span>{a.label}</span>}
        </button>
      ))}
      {debug && (
        <button className="hide-edit-btn" onClick={() => setEditing(true)}>
          エリア編集
        </button>
      )}
      {spot && (
        <div className="room-zoom-back" onClick={() => setSpot(null)}>
          <div className="room-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="room-zoom-view">
              <img src={ROOM} alt="" style={zoom(spot)} />
            </div>
            <button className="sub" onClick={() => setSpot(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
