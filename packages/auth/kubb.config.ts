import { defineConfig } from "@kubb/core";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginClient } from "@kubb/plugin-client";

/**
 * Codegen config for @productcraft/auth.
 *
 * - Reads Specs/auth.json at the workspace root.
 * - Emits per-tag client functions + types under src/_generated/.
 * - Tag names from the spec contain spaces / dots / parens
 *   (e.g. "Consumer · Auth"); normalized to clean lowerCamel
 *   directory names here so generated paths are predictable.
 *
 * The outer Auth class (src/index.ts) composes the generated
 * functions into the public namespace shape — workspace-level admin,
 * app(appId)-scoped admin, and consumer(appSlug)-scoped end-user.
 */
const tagSlug = (tag: string): string => {
  // "Consumer · Auth" → "consumerAuth", "EndUser" → "endUser",
  // "Platform · Stats" → "platformStats", "api-keys" → "apiKeys", etc.
  return tag
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toLowerCase() + w.slice(1)
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("");
};

export default defineConfig({
  root: ".",
  input: { path: "../../Specs/auth.json" },
  output: { path: "./src/_generated", clean: true },
  plugins: [
    pluginOas({ generators: [], validate: false }),
    pluginTs({
      output: { path: "types" },
      group: { type: "tag", name: ({ group }) => tagSlug(group ?? "untagged") },
    }),
    pluginClient({
      output: { path: "clients" },
      group: { type: "tag", name: ({ group }) => tagSlug(group ?? "untagged") },
      client: "fetch",
      clientType: "function",
      paramsType: "object",
      pathParamsType: "object",
      paramsCasing: "camelcase",
      dataReturnType: "data",
    }),
  ],
});
