import { toast } from "sonner";

type AdminToastInput = {
  title: string;
  description?: string;
};

function buildDescription(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

export function notifySuccess(input: AdminToastInput) {
  toast.success(input.title, {
    description: input.description,
  });
}

export function notifyInfo(input: AdminToastInput) {
  toast.info(input.title, {
    description: input.description,
  });
}

export function notifyError(input: AdminToastInput) {
  toast.error(input.title, {
    description: input.description,
  });
}

export function describeAdminResult(
  parts: Array<string | number | null | undefined>,
) {
  return buildDescription(parts);
}
