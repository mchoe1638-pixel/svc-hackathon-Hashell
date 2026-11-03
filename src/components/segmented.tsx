import { cn } from "@/components/utils";

type SegmentedProps<V extends string> = {
  /** 스크린 리더용 묶음 이름 (예: "누가 냈어요?") */
  label: string;
  options: readonly { readonly value: V; readonly label: string }[];
  value: V | null;
  onChange: (value: V) => void;
  disabled?: boolean;
};

/** 여러 개 중 하나 고르기 (시안 .seg): 회색 홈 안에서 고른 칸만 흰 바탕. 낸 사람·결제수단. */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: SegmentedProps<V>) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-md bg-field p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "seg-button press min-h-11 min-w-0 flex-1 truncate rounded-[9px] px-1 text-lead text-sub",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
