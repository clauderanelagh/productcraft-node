// CI test for configcat-dual-run.mjs (task 015): both SDKs offline over equivalent fixtures
// (fixtures/configcat-config.json, ConfigCat's config_v6 format; fixtures/flags-config.json, the
// same flags as a Flags config), 1,000 synthetic users, zero differences; then one changed value
// must show up as differences, so the comparison is proven in both directions.
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as configcat from "configcat-node";
import { FlagsClient } from "@productcraft/flags";
import { dualRun, syntheticUsers } from "./configcat-dual-run.mjs";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const script = fileURLToPath(new URL("./configcat-dual-run.mjs", import.meta.url));

test("the CLI reports zero differences on equivalent configs", () => {
  const out = execFileSync(process.execPath, [script, "--configcat-config", fixture("configcat-config.json"), "--flags-config", fixture("flags-config.json"), "--users", "1000"], { encoding: "utf8" });
  assert.match(out, /^1000 users, 4000 evaluations, 0 difference\(s\)$/m);
});

test("a changed rule shows up as differences (the comparison is not vacuous)", async () => {
  const flagsConfig = JSON.parse(readFileSync(fixture("flags-config.json"), "utf8"));
  flagsConfig.settings.limit.rules[0].serve = 99;
  flagsConfig.settings.bool_flag.percentages = [{ percentage: 31, value: true }, { percentage: 69, value: false }];
  const entry = `${Date.now()}\n"t"\n${readFileSync(fixture("configcat-config.json"), "utf8")}`;
  const cc = configcat.getClient("configcat-sdk-1/TESTTESTTESTTESTTESTAA/TESTTESTTESTTESTTESTAA", configcat.PollingMode.ManualPoll, {
    offline: true,
    cache: { get: () => entry, set: () => undefined },
    logger: configcat.createConsoleLogger(configcat.LogLevel.Off),
  });
  const flags = new FlagsClient({ bootstrap: flagsConfig, offline: true, logger: null });
  const users = syntheticUsers(1000);
  const { differences, evaluations } = await dualRun({ configcat: cc, flags, users });
  assert.equal(evaluations, 4000);
  const byKey = {};
  for (const d of differences) (byKey[d.key] ??= []).push(d);
  assert.ok(byKey.limit.length > 0 && byKey.limit.every((d) => d.configcat === 100 && d.flags === 99));
  assert.ok(byKey.bool_flag.length > 0 && byKey.bool_flag.length < 50, `bucket-30 users only: ${byKey.bool_flag.length}`);
  assert.equal(Object.keys(byKey).sort().join(), "bool_flag,limit");
  // Both sides really evaluated targeting: the rule values occur.
  const values = await flags.getAllValues({ identifier: "x", country: "NL", custom: { plan: "pro" } });
  assert.equal(values.banner, "eu");
  flags.close();
  cc.dispose();
});
