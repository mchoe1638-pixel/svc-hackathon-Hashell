/**
 * 체크 진행률 집계. 화면과 API 라우트는 계산하지 않고 이 함수를 부른다. 외부 라이브러리는 가져오지 않는다.
 *
 * 파일을 `tripStats.ts`가 아니라 따로 둔 까닭: `main`의 `src/core/tripStats.ts`는 디자인 쪽 Wrapped 집계(`buildWrapped`)가
 * 이미 쓰고 있어서, 같은 이름으로 만들면 병합할 때 add/add 충돌이 난다. 병합한 뒤에 그쪽 파일로 옮겨도 된다.
 */

/** 체크 진행률을 셀 때 필요한 품목의 모양. 지출이 달라도 품목 id는 겹치지 않는다. */
export interface ProgressItem {
  readonly id: string;
}

/** 체크 하나(품목 × 멤버). 어느 품목의 체크인지만 본다. */
export interface ProgressShare {
  readonly itemId: string;
}

export interface CheckProgress {
  /** 체크가 하나라도 있는 품목 수. */
  readonly checkedItems: number;
  /** 전체 품목 수. */
  readonly totalItems: number;
}

/**
 * 체크 진행률: 체크가 하나라도 있는 품목 수 / 전체 품목 수.
 *
 * - 한 품목에 체크한 사람이 여럿이거나 같은 체크가 여러 번 들어 있어도 그 품목은 한 번만 센다.
 * - 목록에 없는 품목의 체크는 무시한다.
 * - 같은 id의 품목이 여럿 들어오면 하나로 본다.
 */
export function checkProgress(
  items: readonly ProgressItem[],
  shares: readonly ProgressShare[],
): CheckProgress {
  const itemIds = new Set(items.map((item) => item.id));
  const checkedIds = new Set<string>();
  for (const share of shares) {
    if (itemIds.has(share.itemId)) {
      checkedIds.add(share.itemId);
    }
  }
  return { checkedItems: checkedIds.size, totalItems: itemIds.size };
}
