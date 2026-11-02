import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn 기본 유틸. src/lib/는 백엔드 소유라 여기에 둔다 (components.json의 utils 별칭).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
