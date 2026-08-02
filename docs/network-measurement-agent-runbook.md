# 受控线路测量 Agent 运行手册

本文只覆盖受控探针和目标 agent 的安装、轮换、撤销与故障处理。Agent 不是公共测速服务，不接受任意 IP、URL、端口、命令或远程代码。

## 运行边界

- 只部署经过校验的固定版本 artifact；不在主机上 `git pull`，不从网络加载脚本。
- Agent 只访问 CMS 的 HTTPS 签名接口：`/api/internal/network-measurements/tasks/pull` 和 `/api/internal/network-measurements/ingest`。
- 任务 envelope 先验签，再解析 target allowlist；本机 allowlist 还要再次匹配目标 revision、地址、前缀和端口。
- HMAC secret 只写入 root 可读的环境文件，不能出现在命令行、URL、日志或 systemd unit。
- 每个 probe/target agent 使用独立 `keyId`，撤销后立即停止服务并删除本机 secret。

## 安装清单

1. 在 CMS 中创建 probe 或 target agent，并登记当前配置 revision、能力、归属和 independence key。
2. 为该 principal 签发至少 32 个随机字节的 HMAC secret；只把一次性明文交给安装人员，数据库只保存加密 ciphertext。
3. 将固定 artifact 解压到 `/opt/fwqgo/network-agent/<principal>/`，确认 `bin/fwqgo-network-agent` 的 hash 与发布清单一致。
4. 创建 `/etc/fwqgo/network-agent/<principal>.env`，权限设为 `0600`，至少包含：

   ```text
   FWQGO_AGENT_BASE_URL=https://cms.example.com
   FWQGO_AGENT_PRINCIPAL_KIND=probe
   FWQGO_AGENT_PRINCIPAL_ID=probe-hk-telecom-01
   FWQGO_AGENT_KEY_ID=probe-hk-telecom-01-20260802
   FWQGO_AGENT_SECRET=<一次性签发的 secret>
   ```

5. 创建数据目录并安装 unit：

   ```bash
   install -d -o fwqgo-agent -g fwqgo-agent /var/lib/fwqgo/network-agent/<principal>
   install -m 0644 deploy/systemd/fwqgo-network-agent@.service /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now fwqgo-network-agent@<principal>.service
   ```

6. 检查状态和日志。日志中只能出现任务 ID、状态码和粗粒度错误类别，不得出现 secret、目标合同或原始测量 payload：

   ```bash
   systemctl status fwqgo-network-agent@<principal>.service
   journalctl -u fwqgo-network-agent@<principal>.service --since "15 min ago"
   ```

## 轮换与撤销

1. CMS 为同一 principal 创建新 key，设置短暂重叠窗口；不要修改旧 credential 行。
2. 把新环境文件写入临时路径，校验权限和 keyId 后原子替换正式文件。
3. `systemctl restart fwqgo-network-agent@<principal>.service`，确认新 key 成功 pull/ingest 一次。
4. 在 CMS 撤销旧 key，确认旧 key 的请求返回 `credential_not_found` 或 `credential_revoked`。
5. 新 key 首次成功后删除旧 secret 文件和临时文件。

若探针丢失、主机被接管或发现 secret 泄露，先在 CMS 撤销 credential，再停止 unit；不得等待替换完成后再撤销。

## 故障处理

- `credential_not_found`：检查 principal kind/id、keyId、环境文件权限和 CMS credential 状态。
- `signature_*`：检查 agent 与服务器时钟、请求路径、HTTPS 终止层是否改写 body，以及是否误用了旧 header 名称。
- `target_allowlist_empty`：检查 candidate 当前 target revision 和 prefix verification，不要手工向 agent 添加目标。
- 连续 `run_generation` 或 `stale_run`：停止旧 artifact，确认活动 revision 后再重启；不要重放旧任务。
- 任务长期无样本：先查看 CMS run、probe selector 和 target-agent 归属，再检查网络出口。不要把公共用户请求转成探针命令。

## 发布前验收

- artifact hash、Bun 版本和 adapter 版本已登记。
- `systemctl cat` 显示 `NoNewPrivileges`、`ProtectSystem=strict`、`ProtectHome`、`PrivateTmp` 和受限地址族。
- CMS pull/ingest 均使用 HTTPS 和规定的 `X-FWQGO-*` 头。
- 真实测量前先完成一个无目标的签名失败演练，再用受控目标完成一条成功样本。
- 运行窗口至少七天、覆盖有效自然日和晚高峰后，才允许进入 assessment 审核；没有真实证据时公开工具必须保持 `insufficient`。
