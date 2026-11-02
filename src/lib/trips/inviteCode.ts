/** 초대 코드 길이. PLAN 4장의 "16자 이상" 기준을 그대로 쓴다. 62^16 ≈ 2^95 가지다. */
export const INVITE_CODE_LENGTH = 16;

/** DB `trips.invite_code` 체크 제약과 같은 모양. 링크로 들어온 값도 이 모양이 아니면 조회하지 않는다. */
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{16,64}$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 256 이하에서 62의 배수 중 가장 큰 값. 이 값 이상의 바이트는 버려야 문자별 확률이 같다. */
const ACCEPT_BELOW = 248;

export type RandomBytes = (length: number) => Uint8Array;

const webCryptoRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/** 암호학적 난수로 영숫자 초대 코드를 만든다. 난수원은 테스트에서 바꿔 끼운다. */
export function generateInviteCode(randomBytes: RandomBytes = webCryptoRandomBytes): string {
  let code = '';
  while (code.length < INVITE_CODE_LENGTH) {
    // 버려지는 바이트(약 3%)를 감안해 남은 글자 수의 두 배를 한 번에 받는다.
    const batch = randomBytes((INVITE_CODE_LENGTH - code.length) * 2);
    for (const byte of batch) {
      if (byte >= ACCEPT_BELOW) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === INVITE_CODE_LENGTH) break;
    }
  }
  return code;
}
