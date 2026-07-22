import { z } from "zod";

import {
  MAX_POSTGRES_INTEGER,
  parsePostgresIntegerId,
} from "@fwqgo/core/utils";

export const postgresIntegerIdSchema = z
  .number({ error: "ID 无效" })
  .int("ID 必须是整数")
  .positive("ID 必须是正整数")
  .max(MAX_POSTGRES_INTEGER, "ID 超出数据库范围");

export const formPostgresIntegerIdSchema = z.preprocess((value) => {
  if (typeof value !== "string" && typeof value !== "number") return value;
  return parsePostgresIntegerId(value) ?? value;
}, postgresIntegerIdSchema);
