import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const unit = fs.readFileSync(
  path.join(root, "deploy/systemd/fwqgo-network-agent@.service"),
  "utf8",
);
const runbook = fs.readFileSync(
  path.join(root, "docs/network-measurement-agent-runbook.md"),
  "utf8",
);

for (const required of [
  "After=network-online.target",
  "EnvironmentFile=/etc/fwqgo/network-agent/%i.env",
  "NoNewPrivileges=true",
  "PrivateTmp=true",
  "ProtectSystem=strict",
  "ProtectHome=true",
  "RestrictAddressFamilies=AF_INET AF_INET6",
  "CapabilityBoundingSet=CAP_NET_RAW",
]) {
  if (!unit.includes(required)) {
    throw new Error(`network agent unit missing ${required}`);
  }
}

for (const required of [
  "只访问 CMS 的 HTTPS 签名接口",
  "先验签，再解析 target allowlist",
  "X-FWQGO-*",
  "七天",
]) {
  if (!runbook.includes(required)) {
    throw new Error(`network agent runbook missing ${required}`);
  }
}

console.log("Network measurement agent deployment verified");
