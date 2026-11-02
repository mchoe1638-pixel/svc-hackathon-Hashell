import { Button } from "@/components/ui/button";
import { t } from "@/i18n/ko";

type ErrorStateProps = {
  /** 안내 문구. 생략하면 공통 에러 문구. */
  message?: string;
  /** 다시 시도. 생략하면 버튼을 숨긴다. */
  onRetry?: () => void;
};

/** 에러(`error`) 상태: 짧은 안내 + 다시 시도. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="mt-12 grid justify-items-center gap-4 text-center">
      <p className="text-body text-muted-foreground">{message ?? t("common.error")}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}
