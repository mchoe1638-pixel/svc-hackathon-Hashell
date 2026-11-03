import { describe, expect, it } from "vitest";

import { memberColor, memberHue } from "./member-color";

/** 상대 휘도 (WCAG) */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK = "#191F28";

// 색 규칙(L 0.86, C 0.085, H 272 + 순서 × 137.508)으로 계산한 첫 10개
const FIRST_TEN = [
  "#C2CFFD", // 파랑
  "#FDC2A3", // 살구
  "#8DE4DA", // 민트
  "#EEBEF0", // 연보라분홍
  "#DCD492", // 연노랑
  "#A4D8FE", // 하늘
  "#FFBEBF", // 연분홍
  "#A5E2B8", // 연두
  "#D1C9FF", // 라벤더
  "#F6C894", // 귤
];
// 디자인에서 처음 받은 표. 4번째만 파랑 채널이 1 다르다 (240.46을 반올림하면 240인데 표는 241)
const DESIGN_TABLE = ["#C2CFFD", "#FDC2A3", "#8DE4DA", "#EEBEF1", "#DCD492", "#A4D8FE", "#FFBEBF", "#A5E2B8", "#D1C9FF", "#F6C894"];

describe("memberColor", () => {
  it("첫 10개가 색 규칙으로 계산한 값과 같다", () => {
    expect(FIRST_TEN.map((_, i) => memberColor(i))).toEqual(FIRST_TEN);
  });

  it("첫 10개가 디자인 표와 채널마다 1 이내로 같다", () => {
    DESIGN_TABLE.forEach((want, i) => {
      const got = memberColor(i);
      for (const at of [1, 3, 5]) {
        expect(Math.abs(parseInt(got.slice(at, at + 2), 16) - parseInt(want.slice(at, at + 2), 16))).toBeLessThanOrEqual(1);
      }
    });
  });

  it("첫 20개 중 같은 색이 없다", () => {
    const colors = Array.from({ length: 20 }, (_, i) => memberColor(i));
    expect(new Set(colors).size).toBe(20);
  });

  it("이웃한 두 사람의 색상 차이가 40도 이상이다", () => {
    for (let i = 0; i < 50; i++) {
      const d = Math.abs(memberHue(i + 1) - memberHue(i));
      expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(40);
    }
  });

  it("모든 색에서 이니셜 글자(--ink) 대비가 7:1 이상이다", () => {
    for (let i = 0; i < 50; i++) {
      expect(contrast(memberColor(i), INK)).toBeGreaterThanOrEqual(7);
    }
  });

  it("같은 순서는 항상 같은 색이고, hex 형식이다", () => {
    expect(memberColor(3)).toBe(memberColor(3));
    for (let i = 0; i < 30; i++) expect(memberColor(i)).toMatch(/^#[0-9A-F]{6}$/);
  });
});
