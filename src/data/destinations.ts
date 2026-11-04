/**
 * Wrapped(여행 돌아보기)용 여행지 고정 목록. DB에 두지 않는다 (trips에 destination_id·place_name 컬럼이 없다).
 *
 * - `detect(title)`: 여행 제목(`trips.title`)에 어떤 여행지의 `match` 키워드가 들어 있으면 그 여행지, 없으면 기본 세트.
 * - 색(hex)은 이 파일에만 둔다. 화면은 CSS 변수로 주입하고, 스토리 캔버스는 이 값을 직접 쓴다.
 *   `colors`에 없는 색은 덮어쓰지 않고 앱 기본 색(globals.css)을 그대로 쓴다.
 * - 그림은 `public/art/{file}`. 새 그림은 `<svg>`에 width="200" height="200"을 둔다 (사파리 canvas drawImage).
 * - 여행지를 더하려면 `DESTINATIONS`에 항목 하나를 추가한다. `match`는 소문자로 적는다.
 * - `signature`는 추억 배지 '환산 비교'("우리가 쓴 돈 = 타코야키 312접시")에 쓴다. 값은 `currency` 최소 단위 정수.
 */

import type { BadgeSignature, MenuKeyword } from '@/core/tripStats';

/** 그림 종류. 스토리 이미지가 장마다 종류를 골라 쓴다. */
export type ArtKind = 'landmark' | 'food' | 'drink' | 'symbol';

export interface DestinationArt {
  readonly key: string;
  readonly label: string;
  readonly kind: ArtKind;
  /** `public/art/` 안의 파일 이름. 주소는 `artSrc`로 만든다. */
  readonly file: string;
}

export interface DestinationColors {
  readonly accent: string;
  readonly glow: string;
  readonly night: string;
  readonly paper: string;
}

/** 품목 태그 'highball'인 잔을 그 여행지에서 부르는 이름과, 가장 많이 마신 사람의 칭호. */
export interface DestinationHighball {
  readonly name: string;
  readonly title: string;
}

export interface Destination {
  readonly id: string;
  /** 여행지 이름. 기본 세트는 여행 제목으로 채워서 돌려준다 (`detect`). */
  readonly name: string;
  /** 나라. 없으면 빈 문자열. */
  readonly country: string;
  /** 여행 제목에서 찾을 소문자 키워드. */
  readonly match: readonly string[];
  /** 일부만 있어도 된다. 없는 색은 앱 기본 색을 쓴다. */
  readonly colors: Readonly<Partial<DestinationColors>>;
  /** 최대 6개. 0번은 대표 명소, 1번은 대표 음식(화면의 큰 그림), 나머지는 스토리 이미지 장식. */
  readonly art: readonly DestinationArt[];
  readonly hb: DestinationHighball;
  /** 마지막 장 "이번 여행 우리 이름은"에 나오는 모임 이름. */
  readonly title: string;
  /** 추억 배지 '환산 비교'의 대표 메뉴. */
  readonly signature: BadgeSignature;
}

const OSAKA: Destination = {
  id: 'osaka',
  name: '오사카',
  country: '일본',
  // '일본'은 시안과 같이 일본 여행 전체를 이 세트로 받는다. 도쿄 등을 더하면 그쪽을 앞에 둔다.
  match: ['오사카', 'osaka', '大阪', '간사이', '도톤보리', '난바', '교토', '일본'],
  colors: { accent: '#E0362C', glow: '#FFB81C', night: '#0A1433', paper: '#FFF9EC' },
  art: [
    { key: 'osaka-castle', label: '오사카성', kind: 'landmark', file: 'osaka-castle.svg' },
    { key: 'takoyaki', label: '타코야키', kind: 'food', file: 'takoyaki.svg' },
    { key: 'tsutenkaku', label: '츠텐카쿠', kind: 'landmark', file: 'tsutenkaku.svg' },
    { key: 'highball', label: '하이볼', kind: 'drink', file: 'highball.svg' },
    { key: 'maneki-neko', label: '마네키네코', kind: 'symbol', file: 'maneki-neko.svg' },
  ],
  hb: { name: '하이볼', title: '하이볼 장인' },
  title: '이자카야 정복대',
  signature: { name: '타코야키', price: 650, unit: '접시', currency: 'JPY' },
};

/** 목록에서 못 찾았을 때 쓰는 기본 세트. 어느 나라 여행이든 어색하지 않은 그림만 둔다. */
const DEFAULT_DESTINATION: Destination = {
  id: 'city',
  name: '여행',
  country: '',
  match: [],
  colors: {},
  art: [
    { key: 'generic-city', label: '도시', kind: 'landmark', file: 'generic-city.svg' },
    { key: 'generic-food', label: '여행 밥상', kind: 'food', file: 'generic-food.svg' },
    { key: 'generic-snack', label: '길거리 간식', kind: 'food', file: 'generic-snack.svg' },
    { key: 'cheers', label: '건배', kind: 'drink', file: 'cheers.svg' },
    { key: 'suitcase', label: '여행 가방', kind: 'symbol', file: 'suitcase.svg' },
    { key: 'airplane', label: '비행기', kind: 'symbol', file: 'airplane.svg' },
  ],
  hb: { name: '하이볼', title: '하이볼 장인' },
  title: '맛집 정복대',
  signature: { name: '아메리카노', price: 5000, unit: '잔', currency: 'KRW' },
};

/** 찾는 순서대로. 앞에 있는 여행지가 먼저 걸린다. */
const DESTINATIONS: readonly Destination[] = [OSAKA];

/**
 * 여행 제목으로 여행지를 찾는다. 소문자 부분 문자열 일치이고, 목록 앞쪽이 먼저 걸린다.
 * 못 찾거나 제목이 비었으면 기본 세트를 돌려준다 (기본 세트의 name은 제목, 제목이 없으면 '여행').
 */
export function detect(title: string | null | undefined): Destination {
  const trimmed = (title ?? '').trim();
  const lowered = trimmed.toLowerCase();
  const found = DESTINATIONS.find((d) => d.match.some((keyword) => lowered.includes(keyword)));
  return found ?? { ...DEFAULT_DESTINATION, name: trimmed || DEFAULT_DESTINATION.name };
}

/** 그림 주소. 화면(<img>)과 스토리 캔버스(Image)가 같은 경로를 쓴다. */
export function artSrc(art: DestinationArt): string {
  return `/art/${art.file}`;
}

/**
 * 추억 배지 '메뉴 키워드' 사전. 품목의 한국어 이름·원문에서 찾는다 (대소문자 무시, 영문은 단어 단위).
 * 수량 합이 3 이상이면 "{label} 원정대 · {수량}{unit}".
 */
export const MENU_KEYWORDS: readonly MenuKeyword[] = [
  { label: '라멘', words: ['라멘', '라면', 'ラーメン', 'ramen'], unit: '그릇' },
  { label: '타코야키', words: ['타코야키', 'たこ焼', 'takoyaki'], unit: '접시' },
  { label: '초밥', words: ['초밥', '스시', '寿司', 'すし', 'sushi'], unit: '접시' },
];
