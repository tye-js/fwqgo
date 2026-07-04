import { NextResponse } from "next/server";

import {
  adminActionFailure,
  adminActionSuccess,
} from "@/lib/admin-action-result";

export function adminApiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(adminActionSuccess(data), init);
}

export function adminApiFailure(
  error: unknown,
  init: ResponseInit & {
    title?: string;
    code?: string;
    suggestion?: string;
  } = {},
) {
  const { title, code, suggestion, ...responseInit } = init;
  return NextResponse.json(
    adminActionFailure(error, { title, code, suggestion }),
    responseInit,
  );
}
