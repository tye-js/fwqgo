"use client";

import { useRouter } from "next/navigation";

import { useUnsavedChangesGuard } from "@/features/cms/hooks/use-unsaved-changes-guard";

const defaultMessage = "当前页面还有未保存的修改，确定要离开吗？";

export function useConfirmUnsavedChanges(
  enabled: boolean,
  message = defaultMessage,
) {
  const router = useRouter();

  useUnsavedChangesGuard({
    enabled,
    onNavigationAttempt: (href) => {
      if (window.confirm(message)) router.push(href);
    },
  });
}
