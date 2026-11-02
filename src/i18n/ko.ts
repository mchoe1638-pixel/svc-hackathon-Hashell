/**
 * 화면 문구. 화면 코드에서는 문자열을 직접 쓰지 말고 t("home.title")처럼 키로 쓴다.
 * 변수는 {name} 자리표시자: t("join.welcome", { name: "승화" })
 * 한국어만 지원 (다국어 범위 밖, 키 구조만 유지).
 */
export const ko = {
  app: {
    name: "hashell",
    description: "영수증 사진으로 먹은 만큼, 실제로 낸 만큼 나누는 여행 가계부",
  },
  common: {
    next: "다음",
    done: "완료",
    cancel: "취소",
    confirm: "확인",
    retry: "다시 시도",
    back: "뒤로",
    copy: "복사",
    copied: "복사했어요",
    loading: "불러오는 중",
    error: "문제가 생겼어요. 잠시 후 다시 시도해주세요.",
    estimated: "추정",
  },
  status: {
    OPEN: "참여 받는 중",
    LOCKED: "참여 마감",
    SETTLED: "정산 확정",
  },
  web: {
    title: "방은 hashell 앱에서 만들 수 있어요",
    hint: "초대 링크를 받았다면 그 링크로 바로 들어오세요.",
  },
  create: {},
  invite: {
    barTitle: "동행 초대",
    titleOpen: "단톡방에 링크를 보내주세요",
    hintOpen:
      "링크를 연 사람이 자기 이름을 고르면 참여돼요. 설치나 가입은 필요 없어요.",
    titleLocked: "링크를 잠갔어요",
    hintLocked:
      "이미 참여한 사람은 그대로 쓸 수 있고, 새 기기는 더 들어올 수 없어요.",
    qrLabel: "초대 링크 QR 코드",
    share: "공유하기",
    copyLink: "링크 복사",
    copied: "초대 링크를 복사했어요",
    copyFailed: "복사하지 못했어요. 길게 눌러 직접 복사해주세요.",
    joinedCountStrong: "{joined}명",
    joinedCountRest: " 참여, 전체 {total}명",
    organizer: " (총무)",
    joined: "참여함",
    waiting: "기다리는 중",
    lock: "링크 잠그기",
    lockConfirmTitle: "링크를 잠글까요?",
    lockConfirmHint:
      "이미 참여한 사람은 계속 쓸 수 있어요. 아직 안 들어온 {names}님은 더 들어올 수 없어요.",
    lockConfirmHintNoOne:
      "이미 참여한 사람은 계속 쓸 수 있어요. 아직 안 들어온 사람은 더 들어올 수 없어요.",
    lockConfirm: "잠그기",
    lockDone: "링크를 잠갔어요",
    lockSettled: "정산이 확정된 여행이라 잠글 수 없어요.",
    goHome: "홈으로",
  },
  join: {
    madeBy: "{name}님이 만든 여행이에요",
    question: "누구세요?",
    hint: "내 이름을 골라주세요.",
    boundMeta: "다른 기기에서 참여함",
    newNameLabel: "목록에 내 이름이 없어요",
    newNamePlaceholder: "내 이름",
    submit: "이 이름으로 참여",
    joinedToast: "{name}님으로 참여했어요",
    nameExists: "이미 있는 이름이에요. 목록에서 골라주세요.",
    nameTaken: "다른 기기에서 먼저 골랐어요. 다른 이름을 골라주세요.",
    lockedTitle: "참여가 마감됐어요",
    lockedHint: "총무가 링크를 잠갔어요. 참여하려면 총무 {name}님에게 말해주세요.",
    notFoundTitle: "링크를 찾을 수 없어요",
    notFoundHint: "총무에게 초대 링크를 다시 받아주세요.",
  },
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
