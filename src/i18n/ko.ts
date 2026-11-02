/**
 * 화면 문구. 화면 코드에서는 문자열을 직접 쓰지 말고 t("home.title")처럼 키로 쓴다.
 * 변수는 {name} 자리표시자: t("join.welcome", { name: "승화" })
 * 한국어만 지원 (다국어 범위 밖, 키 구조만 유지).
 */
export const ko = {
  app: {
    name: "먹은만큼",
    description: "영수증 사진으로 먹은 만큼, 실제로 낸 만큼 나누는 여행 가계부",
  },
  common: {
    next: "다음",
    done: "완료",
    cancel: "취소",
    confirm: "확인",
    retry: "다시 시도",
    copy: "복사",
    copied: "복사했어요",
    loading: "불러오는 중",
    error: "문제가 생겼어요. 잠시 후 다시 시도해주세요.",
    estimated: "추정",
  },
  create: {},
  invite: {},
  join: {},
  home: {},
  expense: {},
  itemCheck: {},
  settle: {},
  fx: {},
} as const;

type Messages = typeof ko;

/** "home.title" 같은 점 경로 키의 모든 경우 (문자열 값만) */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let node: unknown = ko;
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown>)[part];
  }
  const text = typeof node === "string" ? node : key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
