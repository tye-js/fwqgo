"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { requirePublicHttpUrl } from "@fwqgo/core/network-url";
import { parseProviderMonitorConfig } from "@fwqgo/core/provider-monitor-config";
import {
  adminActionFailure,
  adminActionSuccess,
} from "@/lib/admin-action-result";
import {
  createProviderMonitor,
  deleteProviderMonitor,
  enqueueProviderMonitorTask,
  getProviderMonitorList,
  updateProviderMonitor,
} from "@/server/offers/provider-monitor";

const monitorInputSchema = z.object({
  id: z.number().int().positive().optional(),
  providerId: z.number().int().positive("请选择厂商"),
  name: z.string().trim().min(1, "请输入监控名称").max(160),
  endpointUrl: z.string().trim().url("请输入完整的库存接口 URL"),
  configText: z.string().trim().max(30_000),
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(1).max(10_080),
  timeoutSeconds: z.number().int().min(1).max(300),
});

export type ProviderMonitorActionInput = z.input<typeof monitorInputSchema>;

function parseConfigText(value: string) {
  if (!value) return parseProviderMonitorConfig({});
  let config: unknown;
  try {
    config = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `字段映射不是有效 JSON：${
        error instanceof Error ? error.message : "请检查逗号和引号"
      }`,
    );
  }
  return parseProviderMonitorConfig(config);
}

export async function saveProviderMonitorAction(
  rawInput: ProviderMonitorActionInput,
) {
  try {
    await requireAdminSession();
    const input = monitorInputSchema.parse(rawInput);
    const endpointUrl = requirePublicHttpUrl(
      input.endpointUrl,
      "库存监控地址",
    ).toString();
    const config = parseConfigText(input.configText);
    const mutationInput = {
      providerId: input.providerId,
      name: input.name,
      endpointUrl,
      config,
      enabled: input.enabled,
      intervalMinutes: input.intervalMinutes,
      timeoutSeconds: input.timeoutSeconds,
    };
    const result = input.id
      ? await updateProviderMonitor(input.id, mutationInput)
      : await createProviderMonitor(mutationInput);

    revalidatePath("/servers/monitor");
    return adminActionSuccess(
      result,
      input.id ? "库存监控配置已更新" : "库存监控配置已创建",
    );
  } catch (error) {
    return adminActionFailure(error, {
      title: "保存库存监控失败",
      suggestion:
        "请检查厂商、接口 URL、字段映射 JSON、执行间隔和超时时间。",
    });
  }
}

export async function runProviderMonitorNowAction(id: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("监控 ID 无效");
    }
    const monitor = (await getProviderMonitorList()).find(
      (item) => item.id === id,
    );
    if (!monitor) throw new Error("库存监控配置不存在");
    if (!monitor.enabled) throw new Error("请先启用库存监控再立即检测");
    await enqueueProviderMonitorTask(id, new Date());
    revalidatePath("/servers/monitor");
    return adminActionSuccess({ id }, "库存检测任务已加入后台队列");
  } catch (error) {
    return adminActionFailure(error, {
      title: "启动库存检测失败",
      suggestion: "请确认监控配置仍然存在且已启用，然后重新执行。",
    });
  }
}

export async function deleteProviderMonitorAction(id: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("监控 ID 无效");
    }
    const result = await deleteProviderMonitor(id);
    revalidatePath("/servers/monitor");
    return adminActionSuccess(result, "库存监控配置已删除");
  } catch (error) {
    return adminActionFailure(error, {
      title: "删除库存监控失败",
      suggestion: "正在运行的监控需要等待本次检测结束后再删除。",
    });
  }
}
