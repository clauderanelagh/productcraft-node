// Writes dist/notify-sw.js (the `@productcraft/notify-js/notify-sw.js` export) from the built string export,
// so the file and `NOTIFY_SW_SOURCE` can never differ.
import { writeFileSync } from "node:fs";
const { NOTIFY_SW_SOURCE } = await import(new URL("../dist/sw.js", import.meta.url).href);
writeFileSync(new URL("../dist/notify-sw.js", import.meta.url), NOTIFY_SW_SOURCE);
console.log("dist/notify-sw.js written");
