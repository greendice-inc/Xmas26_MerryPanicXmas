import { areasToCode as toCode, resetConfigAreas, saveConfigAreas, useConfigAreas, type Area } from './configAreas'

/**
 * ステージ1（輪投げ）のゲーム画面（st1_子供部屋.png 1920×1200）の中で、タップすると拡大する場所。
 * x/y/w/h は画像に対する %。枠の中をタップすると、枠がちょうど収まる大きさに拡大して見せる。
 * ?debug=true のゲーム画面で「エリア編集」から動かして保存すると、Firestore（config/st1Areas）に入り、全端末がそちらを使う。
 */
export const DEFAULT_KIDS_ROOM_AREAS: Area[] = [
  { id: 'picture', label: '絵', x: 14.1, y: 40.9, w: 23.9, h: 25.7 },
  { id: 'sign', label: '看板', x: 59.1, y: 53.2, w: 20.5, h: 22 },
  { id: 'doll', label: 'ぬいぐるみ', x: 74.9, y: 69.2, w: 16.9, h: 18.2 },
]

const DOC = 'st1Areas'

export const useKidsRoomAreas = () => useConfigAreas(DOC, DEFAULT_KIDS_ROOM_AREAS)
export const saveKidsRoomAreas = (areas: Area[]) => saveConfigAreas(DOC, areas)
export const resetKidsRoomAreas = () => resetConfigAreas(DOC)
export const kidsRoomAreasToCode = (areas: Area[]) => toCode('DEFAULT_KIDS_ROOM_AREAS', 'Area', areas)
