import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const workflowPath = path.resolve(".github/workflows/deploy.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const heredocStart = "cat > \"$remote_script\" <<'REMOTE_SCRIPT'";
const startIndex = workflow.indexOf(heredocStart);

if (startIndex < 0) {
  throw new Error("Deploy workflow is missing the remote activation script");
}

const bodyStart = workflow.indexOf("\n", startIndex) + 1;
const endMarker = "\n          REMOTE_SCRIPT";
const bodyEnd = workflow.indexOf(endMarker, bodyStart);

if (bodyStart === 0 || bodyEnd < 0) {
  throw new Error(
    "Deploy workflow has an unterminated remote activation script",
  );
}

const remoteScript = workflow
  .slice(bodyStart, bodyEnd)
  .split("\n")
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");

const syntaxCheck = spawnSync("bash", ["-n"], {
  input: remoteScript,
  encoding: "utf8",
});

if (syntaxCheck.status !== 0) {
  throw new Error(
    `Remote activation script failed bash -n:\n${syntaxCheck.stderr.trim()}`,
  );
}

const readEnvFunction = /read_env_value\(\) \{(?<body>[\s\S]*?)\n\}/.exec(
  remoteScript,
);

if (!readEnvFunction?.groups?.body) {
  throw new Error("Remote activation script is missing read_env_value()");
}

const outputCount = [...readEnvFunction.groups.body.matchAll(/printf "%s"/g)]
  .length;

if (outputCount !== 1) {
  throw new Error(
    `read_env_value() must emit exactly one value; found ${outputCount} outputs`,
  );
}

console.log("Deployment workflow verified: remote activation shell is valid");
