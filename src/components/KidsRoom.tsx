import { MARKS } from '../games/MarkGame'

const ROOM = `${import.meta.env.BASE_URL}BG/Stage1/1st_back_2.webp`

/** ステージ1（輪投げ）のゲーム2の画面：大人部屋の様子。下に、マークと点数を小さく出す */
export default function KidsRoom() {
  return (
    <div className="kids-room">
      <img className="kids-room-bg" src={ROOM} alt="" />
      <ul className="kids-room-marks">
        {MARKS.map((m) => (
          <li key={m.id}>
            <img src={m.image} alt={m.label} draggable={false} />
            <span>{m.answer}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
