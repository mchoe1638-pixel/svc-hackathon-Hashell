import * as React from "react";

import { cn } from "@/components/utils";

// shadcn Skeleton. 로딩(`isLoading`) 상태 표시용.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
