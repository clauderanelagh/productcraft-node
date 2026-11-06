declare const __PC_CORE_VERSION__: string | undefined;

/** This package's version, injected at build time from package.json. */
export const CORE_VERSION: string =
  typeof __PC_CORE_VERSION__ === "string" ? __PC_CORE_VERSION__ : "0.0.0-dev";
