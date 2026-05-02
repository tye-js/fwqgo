/**
 * Run this script with:
 * node --env-file=.env --import tsx import-data.ts
 *
 * Make sure your .env file contains a valid DATABASE_URL.
 * If the script hangs, check your network connection and SSL settings in src/server/db/index.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/server/db/schema.ts";

// 2. 你的目标表和 JSON 文件路径
// 当前目标表: affServiceProviders (你可以改成 schema.users, schema.posts 等)
const TARGET_TABLE = schema.users;
const JSON_FILE_PATH = "./user.json";

type UserInsert = typeof schema.users.$inferInsert;
type UserImportRow = {
  id: string;
  username: string;
  password: string;
  email?: string | null;
  emailVerified?: string | Date | null;
  image?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

function isUserImportRow(value: unknown): value is UserImportRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.id === "string" &&
    typeof row.username === "string" &&
    typeof row.password === "string"
  );
}

function normalizeOptionalString(value: string | null | undefined) {
  if (value == null) {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}

function parseOptionalDate(
  value: string | Date | null | undefined,
  fieldName: string,
) {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    return undefined;
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`${fieldName} 不是合法日期: ${trimmedValue}`);
  }

  return parsedDate;
}

async function main() {
  console.log("🚀 开始导入数据...");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Use a separate connection for the script to avoid potential app config issues and hangs
  const client = postgres(connectionString, {
    prepare: false,
    ssl: { rejectUnauthorized: false }, // Loose SSL to allow self-signed or pooler certs
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });

  try {
    if (!existsSync(JSON_FILE_PATH)) {
      throw new Error(`找不到数据文件: ${JSON_FILE_PATH}`);
    }

    // 3. 读取并解析 JSON 文件
    const fileContent = readFileSync(JSON_FILE_PATH, "utf-8");
    const rawData: unknown = JSON.parse(fileContent);

    if (!Array.isArray(rawData)) {
      throw new Error("JSON 文件格式错误：根元素必须是一个数组 []");
    }

    const jsonData = rawData.map((item): UserInsert => {
      if (!isUserImportRow(item)) {
        throw new Error("JSON 行数据格式错误");
      }

      const createdAt = parseOptionalDate(item.createdAt, "createdAt");
      const updatedAt =
        parseOptionalDate(item.updatedAt, "updatedAt") ?? createdAt ?? new Date();

      return {
        id: item.id.trim(),
        username: item.username.trim(),
        password: item.password,
        email: normalizeOptionalString(item.email),
        emailVerified: parseOptionalDate(item.emailVerified, "emailVerified"),
        image: normalizeOptionalString(item.image),
        createdAt,
        updatedAt,
      };
    });

    if (jsonData.length === 0) {
      console.log("⚠️ JSON 文件是空的，跳过。");
      return;
    }

    console.log(`📦 找到 ${jsonData.length} 条数据，准备插入...`);

    // 4. 执行批量插入 (Batch Insert)
    await db.insert(TARGET_TABLE).values(jsonData).onConflictDoNothing();

    console.log("✅ 导入成功！");
  } catch (error) {
    console.error("❌ 导入失败:", error);
    process.exitCode = 1;
  } finally {
    // 5. 关闭连接
    await client.end();
  }
}

void main();
