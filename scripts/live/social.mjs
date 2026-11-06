#!/usr/bin/env node
// Live smoke for @productcraft/social against production, in the
// testing-environment workspace (docs/sdk-standard.md section 10).
//
//   node scripts/live/social.mjs                       uses packages/social/dist (run `pnpm run build` first)
//   SOCIAL_SDK=/abs/path/to/dist/index.js node …       uses another build (e.g. the published package)
//
// Credentials: the standing testing-environment workspace key in ~/.secrets.toml
// ([productcraft.social_verify] pak), read here and never printed. It changes no
// workspace settings, services, keys or policies. Its own resources live in one
// throwaway community `sdk-smoke-<ts>` (actors, posts and a comment inside it),
// deleted in `finally`; it first deletes stale `sdk-smoke-*` communities a killed
// run left behind. All traffic goes through a throttle: at most 4 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SDK = process.env.SOCIAL_SDK ?? new URL("../../packages/social/dist/index.js", import.meta.url).href;
const { Social, NotFoundError, BadRequestError } = await import(SDK.startsWith("/") ? pathToFileURL(SDK).href : SDK);
const WORKSPACE_ID = "24fab978-7cd7-48ae-bce1-aba876b11957"; // testing-environment
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};

// <= 4 req/s across everything this script sends.
let last = 0;
const throttled = async (input, init) => {
  const wait = last + 250 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return fetch(input, init);
};

function apiKey() {
  const py = 'import tomllib,pathlib;print(tomllib.loads(pathlib.Path.home().joinpath(".secrets.toml").read_text())["productcraft"]["social_verify"]["pak"],end="")';
  return execFileSync("python3", ["-c", py], { encoding: "utf8" });
}

const social = new Social({ apiKey: apiKey(), workspaceId: WORKSPACE_ID, fetch: throttled });
let communityId;
try {
  // Stale communities from killed runs (deleting a community deletes what is inside it).
  let swept = 0;
  for await (const cm of social.communities.list({ q: PREFIX, limit: 50 })) {
    if (cm.slug.startsWith(PREFIX)) {
      await social.communities.delete(cm.id);
      swept += 1;
    }
  }
  console.log(`swept ${swept} stale ${PREFIX}* communities`);

  const community = await social.communities.create({ display_name: TAG, slug: TAG });
  communityId = community.id;
  check(community.slug === TAG, "communities.create");
  const again = await social.communities.retrieve(community.id);
  check(again.id === community.id && typeof again.lastResponse.requestId === "string" && again.lastResponse.requestId.length > 0, "communities.retrieve carries lastResponse.requestId");

  const scope = social.community(community.id);
  const { actor: ada } = await scope.actors.create({ external_id: `${TAG}-ada`, display_name: "Ada (sdk smoke)" });
  const { actor: grace } = await scope.actors.create({ external_id: `${TAG}-grace`, display_name: "Grace (sdk smoke)" });
  check(typeof ada.id === "string" && typeof grace.id === "string", "community(id).actors.create (upsert) x2");
  const byExternal = await scope.actors.byExternal.retrieve(`${TAG}-ada`);
  check(byExternal.id === ada.id, "actors.byExternal.retrieve");

  // The task's call-site acceptance, verbatim.
  const c = social.community(community.id).as(ada.id);
  const post = await c.posts.create({ body: "hello from the SDK smoke" });
  check(post.actor_id === ada.id, ".as(actorId) filled actor_id on posts.create");
  const comment = await c.posts.comments.create(post.id, { body: "first" });
  check(comment.actor_id === ada.id && comment.post_id === post.id, ".as(actorId) filled actor_id on posts.comments.create");
  const firstPage = await c.posts.list({ limit: 1 });
  check(Array.isArray(firstPage.data) && firstPage.data.length === 1, "posts.list({ limit: 1 }) returns one page");

  // An explicit actor_id wins over .as().
  const second = await c.posts.create({ body: "second, as grace", actor_id: grace.id });
  check(second.actor_id === grace.id, "an explicit actor_id wins over .as()");

  // Query-side fill: comments.list declares actor_id (the viewer).
  const comments = await c.posts.comments.list(post.id, { limit: 10 });
  check(comments.data.some((x) => x.id === comment.id), "posts.comments.list with actor_id filled from .as()");

  // for await over more than one page.
  const seen = [];
  let pages = 0;
  for await (const p of c.posts.list({ limit: 1 }).pages()) {
    pages += 1;
    if (pages >= 3) break;
  }
  for await (const p of c.posts.list({ limit: 1 })) seen.push(p.id);
  check(pages === 2 && seen.length === 2 && seen.includes(post.id) && seen.includes(second.id), `for await walks ${seen.length} posts over ${pages} pages of 1`);

  // withResponse() and the X-Request-Id echo.
  const { data, requestId } = await c.posts.retrieve(post.id).withResponse();
  check(data.id === post.id && typeof requestId === "string" && requestId.length > 0, "withResponse() gives data and requestId");
  const rid = `${TAG}-rid`;
  const echoed = await c.posts.retrieve(post.id, {}, { headers: { "X-Request-Id": rid } }); // retrieve takes params (actor_id) first
  check(echoed.lastResponse.requestId === rid, "X-Request-Id sent by the caller is echoed back");

  // Expected errors.
  try {
    await c.posts.retrieve("00000000-0000-0000-0000-000000000000");
    check(false, "404 throws");
  } catch (err) {
    check(err instanceof NotFoundError && !!err.requestId && !!err.docUrl, `404 is NotFoundError (code ${err.code}, requestId and docUrl set)`);
  }
  try {
    await c.posts.create({ body: "bad actor", actor_id: "not-a-uuid" });
    check(false, "400 throws");
  } catch (err) {
    check(err instanceof BadRequestError && err.errors.length > 0, `400 is BadRequestError with errors[] (${err.errors?.map((e) => e.param).join(", ")})`);
  }

  await c.posts.delete(second.id);
  await c.posts.delete(post.id);
  try {
    await c.posts.retrieve(post.id);
    check(false, "deleted post is gone");
  } catch (err) {
    check(err instanceof NotFoundError, "posts.delete (retrieve now 404s)");
  }
} finally {
  if (communityId) {
    await social.communities.delete(communityId).then(
      () => console.log(`deleted community ${TAG}`),
      (err) => {
        console.log(`FAIL delete community ${TAG}: ${err?.status ?? ""} ${err?.message ?? err}`);
        failures += 1;
      },
    );
  }
}
console.log(failures === 0 ? "live smoke: all checks passed" : `live smoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
