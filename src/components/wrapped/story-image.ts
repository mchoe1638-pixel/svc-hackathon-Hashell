import { memberColor } from "@/components/member-avatar";
import { formatMoney } from "@/core/money";
import type { Wrapped, WrappedCategory } from "@/core/tripStats";
import { t } from "@/i18n/ko";

/**
 * 인스타그램 스토리 이미지 (1080×1920). 시안에는 그리는 함수가 없어 마지막 장(s-deep)의 색과 글자 크기를 따라 새로 그렸다.
 * 색은 전부 globals.css의 CSS 변수에서 읽는다 (캔버스는 CSS 변수를 직접 못 쓴다).
 */

const W = 1080;
const H = 1920;
const PAD = 96;

export interface StoryInput {
  readonly tripTitle: string;
  readonly wrapped: Wrapped;
  /** 멤버 id → { 이름, 참여 순서 } */
  readonly members: ReadonlyMap<string, { readonly name: string; readonly order: number }>;
  /** 칭호 한 줄: [칭호, 이유] (화면과 같은 문구) */
  readonly titleLines: ReadonlyMap<string, readonly [string, string]>;
}

/** CSS 변수 값을 읽는다. `--member-1: var(--blue)`처럼 다른 변수를 가리키면 끝까지 따라간다. */
function cssVar(name: string): string {
  const root = getComputedStyle(document.documentElement);
  let value = root.getPropertyValue(name).trim();
  for (let depth = 0; depth < 4; depth++) {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (!ref) break;
    value = root.getPropertyValue(ref[1]).trim();
  }
  return value;
}

/** `var(--x)` 글자를 실제 색으로. */
function resolveColor(cssValue: string): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(cssValue);
  return ref ? cssVar(ref[1]) : cssValue;
}

const CATEGORY_COLOR: Record<WrappedCategory, string> = {
  alcohol: "--night",
  meal: "--trip-accent",
  snack: "--brand",
  drink: "--foam",
  other: "--butter",
};

/** 상자 폭에 맞게 글자 크기를 줄인다 (원래 크기의 60%까지, 시안 fit()과 같은 규칙). 그 뒤에도 넘치면 말줄임. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  weight: number,
  family: string,
  maxWidth: number,
): string {
  let current = size;
  const min = Math.round(size * 0.6);
  ctx.font = `${weight} ${current}px ${family}`;
  while (current > min && ctx.measureText(text).width > maxWidth) {
    current -= 2;
    ctx.font = `${weight} ${current}px ${family}`;
  }
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function drawStory(input: StoryInput): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) await document.fonts.ready;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const night = cssVar("--night");
  const brandInk = cssVar("--brand-ink");
  const brandLight = cssVar("--brand-light");
  const foam = cssVar("--foam");
  const glow = cssVar("--glow");
  const paper = cssVar("--paper");

  // 바탕: 시안 .s-deep 와 같은 방향의 그라데이션
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, brandLight);
  bg.addColorStop(0.55, brandInk);
  bg.addColorStop(1, night);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const inner = W - PAD * 2;
  ctx.textBaseline = "alphabetic";

  // 로고
  ctx.fillStyle = glow;
  ctx.font = `900 64px ${family}`;
  ctx.fillText(t("app.name"), PAD, 190);

  // 여행 이름
  ctx.fillStyle = foam;
  ctx.fillText(fitText(ctx, input.tripTitle, 112, 900, family, inner), PAD, 360);

  // 쓴 돈
  ctx.font = `500 44px ${family}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(t("wrapped.storyTotal"), PAD, 500);
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.fillText(
    fitText(ctx, formatMoney(input.wrapped.totalKrw, "KRW"), 136, 900, family, inner),
    PAD,
    640,
  );

  // 카테고리 막대
  let x = PAD;
  const barY = 700;
  const barH = 72;
  ctx.save();
  roundRect(ctx, PAD, barY, inner, barH, 18);
  ctx.clip();
  ctx.fillStyle = paper;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(PAD, barY, inner, barH);
  ctx.globalAlpha = 1;
  for (const category of input.wrapped.categories) {
    if (category.percent <= 0) continue;
    const width = (inner * category.percent) / 100;
    ctx.fillStyle = cssVar(CATEGORY_COLOR[category.category]);
    ctx.fillRect(x, barY, width, barH);
    x += width;
  }
  ctx.restore();

  // 범례
  let ly = barY + barH + 70;
  ctx.font = `500 36px ${family}`;
  const legend = input.wrapped.categories.filter((c) => c.percent > 0);
  legend.forEach((category, index) => {
    const col = index % 2;
    const lx = PAD + col * (inner / 2);
    if (index > 0 && col === 0) ly += 60;
    ctx.fillStyle = cssVar(CATEGORY_COLOR[category.category]);
    roundRect(ctx, lx, ly - 28, 30, 30, 6);
    ctx.fill();
    ctx.fillStyle = foam;
    ctx.fillText(`${t(`wrapped.cat_${category.category}`)} ${category.percent}%`, lx + 46, ly);
  });

  // 칭호
  let ty = ly + 150;
  ctx.fillStyle = foam;
  ctx.globalAlpha = 0.85;
  ctx.font = `500 44px ${family}`;
  ctx.fillText(t("wrapped.storyTitles"), PAD, ty);
  ctx.globalAlpha = 1;
  ty += 50;

  const rowH = 132;
  const maxRows = Math.max(1, Math.floor((H - 200 - ty) / rowH));
  for (const title of input.wrapped.titles.slice(0, maxRows)) {
    const member = input.members.get(title.memberId);
    const line = input.titleLines.get(title.memberId);
    if (!member || !line) continue;
    const size = 96;
    ctx.fillStyle = resolveColor(memberColor(member.order));
    roundRect(ctx, PAD, ty, size, size, 24);
    ctx.fill();
    ctx.fillStyle = paper;
    ctx.font = `900 48px ${family}`;
    ctx.textAlign = "center";
    ctx.fillText(member.name.slice(0, 1), PAD + size / 2, ty + 66);
    ctx.textAlign = "left";

    const tx = PAD + size + 32;
    const tw = W - PAD - tx;
    ctx.fillStyle = foam;
    ctx.fillText(fitText(ctx, line[0], 56, 900, family, tw), tx, ty + 50);
    ctx.globalAlpha = 0.75;
    ctx.fillText(fitText(ctx, `${member.name}, ${line[1]}`, 34, 500, family, tw), tx, ty + 96);
    ctx.globalAlpha = 1;
    ty += rowH;
  }

  // 아래 한 줄
  ctx.fillStyle = foam;
  ctx.globalAlpha = 0.7;
  ctx.font = `500 36px ${family}`;
  ctx.fillText(t("wrapped.storyFooter"), PAD, H - 120);
  ctx.globalAlpha = 1;

  return canvas;
}

/** 스토리 이미지를 PNG 파일로 만든다. 공유 버튼을 누르기 전에 미리 만들어 둔다 (아래 `shareStoryFile` 설명). */
export async function renderStoryFile(input: StoryInput): Promise<File> {
  const canvas = await drawStory(input);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("toBlob failed");
  return new File([blob], t("wrapped.fileName"), { type: "image/png" });
}

/** shared: 공유창으로 보냄 · cancelled: 사용자가 공유창을 닫음 · fallback: 공유창을 못 씀 → 길게 눌러 저장 안내로 */
export type StoryShareResult = "shared" | "cancelled" | "fallback";

/**
 * 폰 공유창으로 이미지 파일을 보낸다 (navigator.share({ files })).
 *
 * 아이폰 사파리 (코드로 확인한 조건):
 * - iOS 15 이상에서 `navigator.canShare({ files })`가 이미지 파일에 true → 공유창에 "이미지 저장"·인스타그램이 뜬다.
 * - 사용자가 누른 그 순간(transient activation)에 불러야 한다. 누른 뒤 `await`(글꼴 기다림·toBlob)를 먼저 하면
 *   NotAllowedError가 난다. 그래서 파일은 미리 만들어 두고, 이 함수는 누름 처리 안에서 await 없이 바로 부른다.
 * - title·text를 파일과 같이 넣으면 일부 앱에서 파일이 빠지고 글자만 가는 경우가 있어 files만 넣는다.
 * - iOS 14 이하·데스크톱 파이어폭스·Android WebView(앱)는 files 공유가 없거나 막혀 있다 → fallback.
 */
export function shareStoryFile(file: File): Promise<StoryShareResult> {
  if (typeof navigator.share !== "function" || !navigator.canShare?.({ files: [file] })) {
    return Promise.resolve("fallback");
  }
  return navigator.share({ files: [file] }).then(
    () => "shared" as const,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError" ? ("cancelled" as const) : ("fallback" as const),
  );
}
