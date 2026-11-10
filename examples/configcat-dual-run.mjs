#!/usr/bin/env node
// ConfigCat -> ProductCraft Flags dual run (design 3.9).
//
// Evaluates the same users with ConfigCat's official Node SDK and with FlagsClient, side by side,
// and prints every difference. Run it after importing a ConfigCat product into Flags and before you
// swap the SDK: zero differences means your app sees the same values on both.
//
// Everything runs locally: user objects never leave this process (both SDKs evaluate locally).
//
//   cd examples && npm install
//   node configcat-dual-run.mjs \
//     --configcat-key "$CONFIGCAT_SDK_KEY"   (or --configcat-config config_v6.json, offline) \
//     --flags-key "$PRODUCTCRAFT_FLAGS_SDK_KEY"   (or --flags-config config.json, offline) \
//     [--users 1000] [--users-file users.json] [--keys a,b,c]
//
// --users-file: a JSON array of ConfigCat-shaped users ({identifier, email?, country?, custom?}).
// Exit code: 0 with no differences, 1 with differences, 2 on a usage error.
//
// configcat-node is a dependency of this example only (examples/package.json), never of @productcraft/flags.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as configcat from "configcat-node";
import { FlagsClient } from "@productcraft/flags";

const COUNTRIES = ["NL", "DE", "US", "GB", "FR", "PT", "", "SE"];
const PLANS = ["free", "pro", "team"];

/** N deterministic synthetic users: identifiers, some emails, countries and custom attributes. */
export function syntheticUsers(n) {
  const users = [];
  for (let i = 0; i < n; i++) {
    const user = { identifier: `user-${i}` };
    if (i % 3 !== 2) user.email = `user-${i}@${i % 2 ? "example.com" : "acme.io"}`;
    const country = COUNTRIES[i % COUNTRIES.length];
    if (country) user.country = country;
    user.custom = { plan: PLANS[i % PLANS.length], app_version: `${1 + (i % 3)}.${i % 5}.0` };
    users.push(user);
  }
  return users;
}

const toConfigCatUser = (u) => new configcat.User(u.identifier ?? "", u.email, u.country, u.custom);

const silent = { debug() {}, info() {}, warn() {}, error() {} };

/** An offline ConfigCat client over a config_v6.json body (its documented external cache, never a network call). */
function configCatOffline(body) {
  const entry = `${Date.now()}\n"dual-run"\n${body}`;
  return configcat.getClient("configcat-sdk-1/DUALRUNDUALRUNDUALRUNA/DUALRUNDUALRUNDUALRUNA", configcat.PollingMode.ManualPoll, {
    offline: true,
    cache: { get: () => entry, set: () => undefined },
    logger: configcat.createConsoleLogger(configcat.LogLevel.Off),
  });
}

/**
 * Evaluates every user with both SDKs and returns the differences.
 * @param {{configcat: object, flags: FlagsClient, users: object[], keys?: string[]}} o
 */
export async function dualRun({ configcat: cc, flags, users, keys }) {
  const differences = [];
  let evaluations = 0;
  await flags.waitForReady();
  for (const user of users) {
    const ccValues = new Map((await cc.getAllValuesAsync(toConfigCatUser(user))).map((kv) => [kv.settingKey, kv.settingValue]));
    const pcValues = await flags.getAllValues(user);
    const all = keys ?? [...new Set([...ccValues.keys(), ...Object.keys(pcValues)])].sort();
    for (const key of all) {
      evaluations++;
      const inCc = ccValues.has(key);
      const inPc = Object.hasOwn(pcValues, key);
      let a = inCc ? ccValues.get(key) : undefined;
      let b = inPc ? pcValues[key] : undefined;
      // A Flags json setting is parsed; ConfigCat serves the same JSON as text.
      if (inPc && b !== null && typeof b === "object" && typeof a === "string") {
        try {
          a = JSON.stringify(JSON.parse(a));
          b = JSON.stringify(b);
        } catch {
          /* compare as is */
        }
      }
      if (!inCc || !inPc || !Object.is(a, b)) {
        differences.push({ user: user.identifier, key, configcat: inCc ? a : "(missing)", flags: inPc ? b : "(missing)" });
      }
    }
  }
  return { differences, evaluations, users: users.length };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    if (!args["configcat-key"] === !args["configcat-config"]) throw new Error("pass one of --configcat-key or --configcat-config");
    if (!args["flags-key"] === !args["flags-config"]) throw new Error("pass one of --flags-key or --flags-config");
  } catch (e) {
    console.error(`usage error: ${e.message}`);
    process.exit(2);
  }
  const cc = args["configcat-config"]
    ? configCatOffline(readFileSync(args["configcat-config"], "utf8"))
    : configcat.getClient(args["configcat-key"], configcat.PollingMode.ManualPoll, { logger: configcat.createConsoleLogger(configcat.LogLevel.Warn) });
  if (!args["configcat-config"]) await cc.forceRefreshAsync();
  const flags = args["flags-config"]
    ? new FlagsClient({ bootstrap: readFileSync(args["flags-config"], "utf8"), offline: true, logger: silent })
    : new FlagsClient({ sdkKey: args["flags-key"], polling: { mode: "manual" } });
  if (args["flags-key"]) await flags.forceRefresh();

  const users = [...syntheticUsers(Number(args.users ?? 1000))];
  if (args["users-file"]) users.push(...JSON.parse(readFileSync(args["users-file"], "utf8")));
  const keys = args.keys ? args.keys.split(",").map((k) => k.trim()).filter(Boolean) : undefined;

  const { differences, evaluations } = await dualRun({ configcat: cc, flags, users, keys });
  for (const d of differences) console.log(`DIFF user=${d.user} key=${d.key} configcat=${JSON.stringify(d.configcat)} flags=${JSON.stringify(d.flags)}`);
  console.log(`${users.length} users, ${evaluations} evaluations, ${differences.length} difference(s)`);
  flags.close();
  cc.dispose();
  process.exit(differences.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
