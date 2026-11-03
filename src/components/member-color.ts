/**
 * 멤버 색: 참여 순서(0부터)만으로 정해지는 연한 단색. 몇 명이 되든 계속 다른 색이 나온다.
 *
 * - OKLCH 밝기 L = 0.86 고정, 채도 C = 0.085 (sRGB를 벗어나면 0.005씩 낮춘다)
 * - 색상 H = 272(브랜드 파랑 #4B5CF1의 색상) + 순서 × 137.508(황금각)
 *   → 첫 사람은 연한 파랑, 이웃한 사람끼리는 색이 크게 다르고 끝없이 겹치지 않는다.
 * - 무작위가 아니라 순서로 정하므로 같은 사람은 기기·새로고침마다 같은 색이다.
 * - CSS oklch()가 아니라 hex로 내보낸다 (스토리 이미지 캔버스에서도 같은 값을 쓰려고).
 *
 * 외부 라이브러리·React 없이 순수 계산만 한다.
 */

const LIGHTNESS = 0.86;
const CHROMA = 0.085;
const CHROMA_STEP = 0.005;
const BRAND_HUE = 272;
const GOLDEN_ANGLE = 137.508;

type Rgb = readonly [number, number, number];

/** 참여 순서 → 색상(도). 0 이상 360 미만. */
export function memberHue(order: number): number {
  return (((BRAND_HUE + order * GOLDEN_ANGLE) % 360) + 360) % 360;
}

/** OKLCH → 선형 sRGB (0~1 밖이면 화면에 못 그리는 색). */
function oklchToLinearRgb(l: number, c: number, hueDeg: number): Rgb {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];
}

function inGamut(rgb: Rgb): boolean {
  return rgb.every((v) => v >= 0 && v <= 1);
}

/** 선형 값 → sRGB 감마 → 0~255 → 두 자리 16진수 */
function toHexChannel(linear: number): string {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  const byte = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return byte.toString(16).padStart(2, "0").toUpperCase();
}

/** 참여 순서(0부터)로 멤버 색(hex, 예: "#C2CFFD")을 정한다. */
export function memberColor(order: number): string {
  const hue = memberHue(order);
  let rgb = oklchToLinearRgb(LIGHTNESS, CHROMA, hue);
  // 0.005씩 낮추되 소수 오차가 쌓이지 않게 단계 수로 센다
  for (let step = 1; !inGamut(rgb) && CHROMA - step * CHROMA_STEP >= 0; step++) {
    rgb = oklchToLinearRgb(LIGHTNESS, CHROMA - step * CHROMA_STEP, hue);
  }
  return `#${rgb.map(toHexChannel).join("")}`;
}
