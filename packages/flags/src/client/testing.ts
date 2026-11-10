// createTestClient (design 8.2): a FlagsClient for unit tests. `local_only` overrides, no network,
// no timers, the same typed API, and `set()` to change a value mid-test.

import type { User } from "@productcraft/flags-engine";
import { FlagsClient, setOverride } from "./client.js";
import type { OverrideValue } from "./types.js";

export interface TestClientOptions {
  /** Flag and setting values by key. Objects, arrays and null become json settings. */
  values?: Record<string, OverrideValue>;
  /** The default user (evaluations of fixed values ignore it; it is there for code that reads it). */
  user?: User;
}

/** A FlagsClient whose values you set in the test. */
export class TestFlagsClient extends FlagsClient {
  /** Changes one value; emits `configChanged`. */
  set(key: string, value: OverrideValue): void {
    setOverride(this, key, value);
  }
}

/**
 * A FlagsClient for tests: no SDK key, no network, no timers.
 * @example
 * ```ts
 * import { createTestClient } from "@productcraft/flags/testing";
 * const flags = createTestClient({ values: { new_checkout: true } });
 * await flags.getValue("new_checkout", false); // true
 * flags.set("new_checkout", false);
 * ```
 */
export function createTestClient(options: TestClientOptions = {}): TestFlagsClient {
  return new TestFlagsClient({
    overrides: { values: options.values ?? {}, behaviour: "local_only" },
    defaultUser: options.user,
    polling: { mode: "manual" },
    logger: null,
  });
}
