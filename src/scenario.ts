import { GAME_COUNT } from './config'

export type Emotion = '怒' | '喜' | '哀' | '楽' | '真顔'

/** 背景画像のパス。folder は public/BG 配下の 'Stage1' など */
export function backgroundImage(folder: string): string {
  const prefix = 'st' + folder.replace('Stage', '')
  return `${import.meta.env.BASE_URL}BG/${folder}/${prefix}_背景.jpg`
}

export interface NovelLine {
  speaker: string
  text: string
  /** 表情（省略時は真顔） */
  emotion?: Emotion
  /** 文字の大きさ（省略時は md） */
  size?: 'sm' | 'md' | 'lg'
  /** パネルに出す画像（public 配下のパス）。台詞の上に表示 */
  image?: string
  /** この台詞を話すキャラクターのフォルダ名（省略時はシーンの character） */
  character?: string
  /** 台詞の代わりに、画面の中央へフェードインさせる表示 */
  banner?: string
  /** キャラクター画像を直接指定する（シルエットなど、表情の決まりに当てはまらない画像） */
  charSrc?: string
  /** 台詞と一緒に、画面の中央へフェードインさせる画像 */
  slide?: string
  /** 台詞の代わりに、ハートを押したときと同じ「キモチ」のダイアログを出す */
  mood?: Mood
  /** この台詞が出たときに鳴らす効果音・音声（URL） */
  se?: string
  voice?: string
}

/** ハートを押したときに出す「キモチ」 */
export interface Mood {
  icon: string
  name: string
  lines: { who?: string; text: string }[]
}

/** キャラクター画像のパス。folder は public/character 配下の 'Stage1'（prefix は st1）や 'Common'（案内役のエルフ、prefix は elf） */
export function characterImage(folder: string, emotion: Emotion = '真顔'): string {
  const prefix = folder === 'Common' ? 'elf' : 'st' + folder.replace('Stage', '')
  return `${import.meta.env.BASE_URL}character/${folder}/${prefix}_${emotion}.png`
}

export interface NovelScene {
  /** 背景のフォルダ名（public/BG 配下。例: 'Stage1'）。未設定ならプレースホルダー */
  background?: string
  /** キャラクターのフォルダ名（public/character 配下。例: 'Stage1'）。未設定ならプレースホルダー */
  character?: string
  lines: NovelLine[]
}

const elf1 = (text: string, emotion: Emotion = '真顔'): NovelLine => ({ speaker: 'エルフ', character: 'Common', text, emotion })
const rin = (text: string, emotion: Emotion = '楽', speaker = 'リン'): NovelLine => ({ speaker, text, emotion })

/** ステージ1：リンのキモチ。マークを当てているあいだと、リングを投げたあと */
export const ST1_MOOD: Mood = {
  icon: characterImage('Stage1', '楽'),
  name: 'リン',
  lines: [{ text: '小さいころからわなげは得意だったんだもん。このゲームも絶対に勝てるはず！' }],
}
export const ST1_MOOD_AFTER: Mood = {
  icon: characterImage('Stage1', '喜'),
  name: 'リン',
  lines: [{ text: '1億ポイント取ったと思って、大喜びしている。' }],
}

/** ステージ1の導入。エルフとリン（子ども部屋からの通信） */
const STAGE1_INTRO: NovelScene = {
  character: 'Stage1',
  background: 'Stage1',
  lines: [
    elf1('こんにちは！{笑顔}にしましょう！一行あたりの\n文字数を知りたいから長い文章を書かせてもらいますよ。\nどこまで入りますかねえ～？改行はできないのかな？', '楽'),
    elf1('それでは、さっそく次のゲームを始めましょう。'),
    elf1('子ども部屋からの通信です。'),
    rin('こんにちは！', '楽', '？？？'),
    rin('私はリンだよー！', '喜', '？？？'),
    rin('私とやるゲームは{『ポイントリング』}！！', '喜'),
    rin('リングを投げて、ポイントをゲットするゲームみたい！'),
    elf1('このゲームは、おおざっぱに言うと{わなげゲーム}です。\nより高いポイントをゲットした方の勝ちです。'),
    elf1('それぞれの部屋には、{ターゲット}が設置されます。\n投げ手の人は、そのターゲットに向かって{リング}を投げます。'),
    elf1('リングが通ったターゲットに応じて、ポイントが入ります。'),
    elf1('ちなみに、\nリングがどのターゲットにも通らなかった場合は……'),
    elf1('やる気なしとみなされ、\n負けではなく{「失格」}となりますのでご注意ください。', '怒'),
    rin('ポイントは何で決まるんだろう？', '真顔'),
    elf1('このゲームでは、{「楽器を持っている・身に着けている動物」}が\n{ターゲット}となります。'),
    elf1('そして、ターゲットが身に着けている{タグ}に描かれた\n{マーク}によって、ゲットできるポイントが決まります。'),
    elf1('どのマークが何ポイントなのかは、ナゾを解くことで分かります。'),
    rin('なるほどね。じゃあ、ナゾをしっかり解かないと、\nどれを狙えばいいかが分からないんだ。', '真顔'),
    rin('オッケー！ナゾを解こう！', '喜'),
    // エルフがこちら（大人）に向けて話す
    elf1('ここで、リンさんの気持ちを読み取っておきましょう……'),
    rin('小さいころから{わなげ}は得意だったんだもん。\nこのゲームも{絶対に勝てるはず！}', '楽', 'リン（心の声）'),
    elf1('それでは、まずナゾを解きましょう！', '楽'),
    elf1('机の上のラックにある「第1ゲーム」のクリアファイルから\n{5枚のナゾだけを取り出し}てください。'),
    elf1('それぞれのマークが何ポイントなのかが分かったところで、\n続きのルール説明をしていきます。'),
  ],
}

const BASE = import.meta.env.BASE_URL

/** ステージ2：三人兄弟のシルエット（見つかるまではこちらを出す） */
export const st2Silhouette = (emotion: Emotion = '真顔') => `${BASE}character/Stage2/st2_silhouette_${emotion}.png`
/** ステージ2：兄弟ひとりずつの画像 */
export const ST2_KIDS = {
  amy: { name: 'アミー', image: `${BASE}character/Stage2/st2_アミー.png` },
  jimmy: { name: 'ジミー', image: `${BASE}character/Stage2/st2_ジミー.png` },
  tommy: { name: 'トミー', image: `${BASE}character/Stage2/st2_トミー.png` },
} as const
/** ステージ2：ゲーム画面。found は見つけた人数（0〜3） */
export const st2GameImage = (found: number) => `${BASE}BG/Stage2/st2_ゲーム画面_${Math.min(4, found + 1)}.png`

/** ダミー（マネキン）の画像。専用の画像ができるまでは商品カードを使う */
export const MANNEQUIN_IMAGE = `${BASE}slide/st2/card.png`

/** 「記録」から見返せる画像 */
export const RECORDS: Record<string, { title: string; image: string }> = {
  'st2-card': { title: 'マネキンとセーターの商品カード', image: `${BASE}slide/st2/card.png` },
}

/** ステージ2：三人のキモチ。誰がどの名前かはわからないので、アイコンはシルエットのまま */
export const ST2_MOOD: Mood = {
  icon: st2Silhouette('楽'),
  name: 'アミー・ジミー・トミー',
  lines: [
    { who: 'アミー（長男）', text: 'みんながどこに隠れたか知りたいから、一番初めに見つけて欲しいな' },
    { who: 'ジミー（次男）', text: 'お兄ちゃんよりは長く隠れていたいな' },
    { who: 'トミー（三男）', text: '最後に僕とダミーの二人になって、ダミーに引っかかって欲しいな' },
  ],
}

const ST2_KIDS_NAME = 'アミー・ジミー・トミー'

/** ステージ2の導入。三人兄弟（シルエット）とかくれんぼ */
const STAGE2_INTRO: NovelScene = {
  character: 'Stage2',
  background: 'Stage2',
  lines: [
    { speaker: ST2_KIDS_NAME, charSrc: st2Silhouette('楽'), text: 'こんにちは！', emotion: '楽' },
    { speaker: ST2_KIDS_NAME, charSrc: st2Silhouette('楽'), text: '僕たち三人兄弟とかくれんぼで遊ぼうよ！', emotion: '楽' },
    {
      speaker: ST2_KIDS_NAME,
      charSrc: st2Silhouette('真顔'),
      text: 'あ、そうそうさっき注文で子供のマネキンと洋服を2つ買って、ダミーを作ったんだ。',
      slide: RECORDS['st2-card'].image,
    },
    { speaker: ST2_KIDS_NAME, charSrc: st2Silhouette('喜'), text: 'ダミーと合わせて4人で隠れるから、大人のふたりは僕らを見つけてね。', emotion: '喜' },
    { speaker: 'エルフ', character: 'Common', text: 'キモチヨメール使って調べます。', emotion: '真顔' },
    { speaker: '', text: '', mood: ST2_MOOD },
    { speaker: 'エルフ', character: 'Common', text: 'まずは長男のアミーを見つけよう！', emotion: '楽' },
  ],
}

/** ステージ2のクリア。見つかったので、シルエットではない方の画像を出す */
const STAGE2_CLEAR: NovelScene = {
  character: 'Stage2',
  background: 'Stage2',
  lines: [
    { speaker: ST2_KIDS_NAME, text: 'やったー！勝った勝ったー！', emotion: '喜' },
    { speaker: ST2_KIDS_NAME, text: 'すごく楽しかった！遊んでくれてありがとう！', emotion: '楽' },
  ],
}

/** ステージ3：カイ・メイ（ふたりで一枚の画像） */
export const ST3_NAME = 'カイ・メイ'
/** ステージ3：ゲーム画面。1・2は押さえてワード、3は部屋でやるお題 */
export const st3GameImage = (n: 1 | 2 | 3) => `${BASE}BG/Stage3/st3_ゲーム画面_${n}.png`

/** ステージ3：ふたりのキモチ */
export const ST3_MOOD: Mood = {
  icon: characterImage('Stage3', '楽'),
  name: ST3_NAME,
  lines: [
    { who: 'カイ', text: '私たちの考えたゲームを全部解いてほしい！' },
    { who: 'メイ', text: '私たちの考えたゲームを全部解いてほしい！' },
  ],
}

/** ステージ3の導入。カイ・メイと押さえてワード */
const STAGE3_INTRO: NovelScene = {
  character: 'Stage3',
  background: 'Stage3',
  lines: [
    { speaker: ST3_NAME, text: '今回の対戦相手ですね。', emotion: '楽' },
    { speaker: ST3_NAME, text: '私たちの考えたカイ・メイゲームをやってもらいます。', emotion: '喜' },
    { speaker: ST3_NAME, text: '全部クリアできますかね？', emotion: '楽' },
    { speaker: 'エルフ', character: 'Common', text: 'キモチヨメール使用中…', emotion: '真顔' },
    { speaker: '', text: '', mood: ST3_MOOD },
    { speaker: 'エルフ', character: 'Common', text: '頑張ってクリアしましょう。', emotion: '楽' },
  ],
}

/** ステージ4：ロビン */
export const ST4_NAME = 'ロビン'
/** ステージ4：ジャック機能のアイコン */
export const JACK_ICON = `${BASE}BG/Common/noz_icon.webp`
/** ステージ4：ビンゴカードと、穴の画像 */
export const BINGO_CARD_IMAGE = `${BASE}BG/Stage4/bingo/bingo_card.png`
export const BINGO_HIT_IMAGE = `${BASE}BG/Stage4/bingo/hit.png`

/** ステージ4：ロビンのキモチ */
export const ST4_MOOD: Mood = {
  icon: characterImage('Stage4', '楽'),
  name: ST4_NAME,
  lines: [{ text: '勝ちたいなあ～' }],
}

/** ステージ4の導入。ロビンとカタカナビンゴ（ルール説明の続きはゲーム画面で） */
const STAGE4_INTRO: NovelScene = {
  character: 'Stage4',
  background: 'Stage4',
  lines: [
    { speaker: ST4_NAME, text: 'あ！対戦相手？', emotion: '真顔' },
    { speaker: ST4_NAME, text: '勝つぞ～！', emotion: '楽' },
    { speaker: 'エルフ', character: 'Common', text: '今回のゲームのルールを説明します。', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: '最初はチュートリアルを行いながらルールを説明します。', emotion: '真顔' },
  ],
}

/** LAST：ルドリー（ゲームマスター） */
export const STF_NAME = 'ルドリー'
/** LAST：マスターエルフ（エルフの上位存在）の立ち絵 */
export const masterElfImage = (emotion: Emotion = '真顔') => `${BASE}character/StageF/master_elf_${emotion}.png`
export const MASTER_ELF_NAME = 'マスターエルフ'

/** LAST：ルドリーのキモチ。マスターエルフの話のあとで「逆転勝利したい！」に変わる */
export const LAST_MOOD: Mood = {
  icon: characterImage('StageF', '楽'),
  name: STF_NAME,
  lines: [{ text: '大人のみんなと真剣勝負がしたい！' }],
}
export const LAST_MOOD_AFTER: Mood = {
  icon: characterImage('StageF', '怒'),
  name: STF_NAME,
  lines: [{ text: '逆転勝利したい！' }],
}

const master = (text: string, emotion: Emotion = '真顔'): NovelLine => ({ speaker: MASTER_ELF_NAME, text, emotion, charSrc: masterElfImage(emotion) })
const rud = (text: string, emotion: Emotion = '哀', speaker = STF_NAME): NovelLine => ({ speaker, text, emotion })

/** LAST：大人がルドリーのアイテムを取り出してしまったあと。マスターエルフが出てくる */
const LAST_TWIST: NovelScene = {
  character: 'StageF',
  background: 'StageF',
  lines: [
    master('あなた達、何をしてるんですか！？\nルドリーの様子を見てみなさい！！', '怒'),
    rud('なんかね、アイテムをね、発送したんだけど、\n宅配ソックスには届いたって連絡は来てて、'),
    rud('そのナゾを解いたんだけど、\n開けようとしたら、モニターは消えてて、'),
    rud('番号は合ってるはずなのに、開かなくて……'),
    master('あなた達、とんでもないことをしましたね。', '怒'),
    master('あなた達が宅配ソックスから取り出した、いえ奪ったのは、\nまさしくルドリーが注文したアイテムです。', '怒'),
    master('結果として、あなた達は\n生還目標ポイントを獲得できたかもしれません。'),
    master('しかし……当然ですが……'),
    master('ルドリーをこんな目に合わせるような大人を、\nエルフとして許すわけにはいきません。', '怒'),
    master('心を読んでみましょうか？'),
    rud('どうして宅配ソックスが開かないんだろう？\n今のままじゃ、何もできないままボクが負けちゃう！', '哀', 'ルドリー（心の声）'),
    rud('……でも、あきらめちゃだめだ！\nここから逆転する方法があるはずだ。', '真顔', 'ルドリー（心の声）'),
    rud('こうなったらなんとかして勝って終わりたい……！\nいち、に、に、ご……いち、に、に、ご……', '怒', 'ルドリー（心の声）'),
    master('どうやら、ルドリーはまだ希望を捨てていないようです。'),
    master('先ほどあなた達が大人部屋で取った行動を\n打ち消すことはできません。'),
    master('そして、大人部屋に入ること自体もうできません。'),
    master('あなた達の力で、この状況からルドリーを勝利に導き、\n喜ばせてください！！！', '怒'),
  ],
}

/** LAST：エントツの説明画像 */
const entotsu = (n: '' | '2' | '3') => `${BASE}BG/StageF/entotsu_setsumei${n}.png`

/** LAST の前説。ルドリーとエルフがエントツギフトのルールを説明する（1つの吹き出しは2行まで） */
const LAST_INTRO: NovelScene = {
  character: 'StageF',
  background: 'StageF',
  lines: [
    { speaker: 'エルフ', character: 'Common', text: 'さて、いよいよ次が最後のゲームですね。', emotion: '真顔' },
    { speaker: '？？？', text: 'いよいよファイナルゲーム。\nこのボク、ルドリーが相手だ！', emotion: '楽' },
    { speaker: STF_NAME, text: 'ファイナルゲームは「エントツギフト」\nルールは簡単。', emotion: '楽' },
    { speaker: STF_NAME, text: '子ども部屋と大人部屋に、\nこのゲームのためのエントツが用意されているんだ。', emotion: '真顔' },
    { speaker: STF_NAME, text: 'このエントツにボールが通ったら10ポイントで、\n最終的にポイントが多い方が勝ち！', emotion: '楽' },
    { speaker: STF_NAME, text: '詳しいルール説明はエルフさん、お願いします！', emotion: '喜' },
    { speaker: 'エルフ', character: 'Common', text: 'それでは詳しいルールについて説明します。\nまず、ポイントの獲得方法について。', emotion: '真顔', slide: entotsu('') },
    { speaker: 'エルフ', character: 'Common', text: 'エントツの内部には、一番下のところにセンサーがあり、', emotion: '真顔', slide: entotsu('2') },
    { speaker: 'エルフ', character: 'Common', text: 'ここを1個のボールが1回通過するたびに\n10ポイントが入ります。', emotion: '真顔', slide: entotsu('3') },
    { speaker: 'エルフ', character: 'Common', text: 'このゲームでは大人チームが先に行動をします。', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: '大人チームは必要だと思うアイテムを発送し、\n用意したすべてのボールをエントツに投入します。', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: 'その後、子どもチームが同様にアイテムを発送し、\nすべてのボールをエントツに投入します。', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: 'ボールの投入をはじめとした行動は、\nすべてエルフが行います。', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: 'エントツの上の端の高さから、勢いをつけずに落とすので、\n大人も子どもも同じ条件で投入されることになります。', emotion: '真顔' },
    { speaker: 'ゲームマスター・ルドリー', text: 'それから、ボクはあんまりよく知らないんだけど、\n大人はこのゲームで達成しないといけない目標があるんだよね？', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: 'そうです。このゲームを通して、大人たちは\n200ポイントを越えるポイントを獲得しなければなりません。', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: '200ポイントちょうどではダメです。\n200ポイントを越えてください。', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: 'これは、このゲームに真剣に取り組んでもらうための\n目標設定であり、', emotion: '真顔' },
    { speaker: 'エルフ', character: 'Common', text: '大人の皆さんはこの条件を達成しないと生還できません。\n是非がんばってくださいね。', emotion: '楽' },
    { speaker: 'ゲームマスター・ルドリー', text: '大人って大変なんだね。', emotion: '哀' },
    { speaker: 'ゲームマスター・ルドリー', text: 'ボクとしても、この最後のゲームでは\n大人のみんなにも全力を出してほしいんだ。', emotion: '真顔' },
    { speaker: 'ゲームマスター・ルドリー', text: '真剣勝負の結果なら、もし負けたとしても、\nボクは笑って終われると思うから。', emotion: '楽' },
    { speaker: 'エルフ', character: 'Common', text: 'それでは間もなくゲーム開始となります。', emotion: '真顔' },
    { speaker: 'ゲームマスター・ルドリー', text: 'じゃあボクも準備を始めよう。\n大人のキミたちもがんばってね！', emotion: '喜' },
    { speaker: 'エルフ', character: 'Common', text: '必要なアイテムを発送し、\nあなた達の「大人の全力」を見せてください。', emotion: '楽' },
  ],
}

/** ノベルパートのシナリオ。添字はステージ番号 - 1（ステージ番号は 1〜GAME_COUNT） */
export const NOVEL: NovelScene[] = Array.from({ length: GAME_COUNT }, (_, i): NovelScene => {
  if (i === 0) return STAGE1_INTRO
  if (i === 1) return STAGE2_INTRO
  if (i === 2) return STAGE3_INTRO
  if (i === 3) return STAGE4_INTRO
  // ステージ4のあとは LAST（ファイナルゲーム）
  if (i === 4) return LAST_INTRO
  // 素材が揃っているのは Stage1〜4。5以降は仮で Stage1 を使う
  return {
    character: `Stage${i < 4 ? i + 1 : 1}`,
    background: `Stage${i < 4 ? i + 1 : 1}`,
    lines: [
      { speaker: 'サンタ', text: `ここは部屋${i + 1}だよ。クリスマスの準備が大変なんだ！`, emotion: '哀' },
      { speaker: 'サンタ', text: 'プレゼントを守るために、力を貸してくれないかな？', emotion: '真顔' },
      { speaker: 'サンタ', text: 'まずは、この勝負に勝ってみよう！', emotion: '楽' },
    ],
  }
})

export const ENDING: NovelScene = {
  character: 'StageF',
  background: 'StageF',
  lines: [
    { speaker: 'サンタ', text: 'ありがとう！おかげでクリスマスは大成功だ！', emotion: '喜' },
    { speaker: 'サンタ', text: 'メリークリスマス！', emotion: '楽' },
  ],
}

/** ステージ1の導入のあとの、エルフと子供の会話 */
const STAGE1_CLEAR: NovelScene = {
  character: 'Stage1',
  background: 'Stage1',
  lines: [
    { speaker: 'エルフ', character: 'Common', text: '無事特定できたみたいですね。', emotion: '真顔' },
    { speaker: '子供', text: 'やったー！いちおくポイントゲット！', emotion: '楽' },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: 'どうやらリンはもうポイントリングを終えちゃったみたいです。一億ポイントもゲットできるマークはないはずですが・・・',
      emotion: '真顔',
    },
    { speaker: '', text: '', banner: 'リン１ポイント' },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: 'やっぱり…1億点取ったと思い込んでいるみたいです。このままだと、ゲームに負けることができないですね…',
      emotion: '哀',
    },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: 'そうだ！Santazonを使いましょう！Santazonを使うと、勝負に必要なアイテムを購入することができるんです！',
      emotion: '楽',
    },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: 'タブレットの左下にある注文ボタンを押すとSantazonのページを開くことができます。',
      emotion: '真顔',
    },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: '必要なアイテムを3つまでカートに追加して、注文確定ボタンを押すと注文したものが宅配ソックスに届きます。',
      emotion: '真顔',
    },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: '宅配ソックスの番号は、注文した後に出てくる謎を解くとわかるようになってます！',
      emotion: '真顔',
    },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: '詳しい説明はSantazonページのSantazonの使い方。ボタンを押してみてください。',
      emotion: '真顔',
    },
    {
      speaker: 'エルフ',
      character: 'Common',
      text: 'では、Santazonを使ってゲームに負ける方法を考えてください！',
      emotion: '楽',
    },
  ],
}

/** ゲームをクリアしたときの会話。添字はステージ番号 - 1 */
export const CLEAR: NovelScene[] = NOVEL.map((n, i): NovelScene => {
  if (i === 0) return STAGE1_CLEAR
  if (i === 1) return STAGE2_CLEAR
  // LAST のクリア会話は、マスターエルフが出てくる場面（ゲームの途中で入る）
  if (i === 4) return LAST_TWIST
  return {
    character: n.character,
    background: n.background,
    lines: [
      { speaker: 'サンタ', text: '{クリア}してくれてありがとう！', emotion: '喜' },
      { speaker: 'サンタ', text: 'おかげで助かったよ！さあ、次へ進もう！', emotion: '楽' },
    ],
  }
})
