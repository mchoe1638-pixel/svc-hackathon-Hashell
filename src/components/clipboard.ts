/** 글자를 클립보드에 복사한다. 성공하면 true. (초대 링크 공유는 `src/lib/native.ts`의 `shareInvite`를 쓴다) */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
