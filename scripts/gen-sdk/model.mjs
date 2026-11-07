// Reads an OpenAPI document and builds the operation model the emitters use.
// Names, scope binding, pagination, polling, `public` and exclusions come only
// from `x-pc-sdk`; public type names only from `x-pc-sdk-model`
// (docs/sdk-standard.md section 3). Any rule violation throws a GenError
// naming the operation; the generator has no soft mode.

import { IDENT, camel, pascal, typeStem } from "./util.mjs";

export class GenError extends Error {
  constructor(problems) {
    super(`gen-sdk: ${problems.length} problem(s)\n  - ${problems.join("\n  - ")}`);
    this.problems = problems;
  }
}

const HTTP = ["get", "post", "put", "patch", "delete"];
/** Section 3.5: names reserved by hand-written code (plus JS names that would break objects). */
export const RESERVED = new Set([
  "client", "withResponse", "asResponse", "lastResponse", "as", "public", "community", "app", "admin",
  "consumer", "verifyToken", "poll", "createAndPoll", "then", "constructor", "prototype", "toJSON",
]);
/** Section 3.2 rule 4: verbs that never appear as SDK methods. */
export const BANNED_VERBS = new Set(["remove", "get", "show", "fire", "getById", "upsert", "put", "submit"]);
/** Which HTTP methods each standard verb may sit on. */
// `delete` may also name a POST action that removes one object without an HTTP DELETE
// (Social's `POST …/tags/{tagged_actor_id}/remove`): the action verb would be the banned
// "remove", and openapi-audit accepts `delete` there. It still needs an id (below).
const VERB_HTTP = { list: ["get"], create: ["post"], retrieve: ["get"], update: ["patch", "put"], delete: ["delete", "post"], export: ["get"], erase: ["delete"] };
/** Bound by the client itself (option, env, or key lookup): never a scope. */
const CLIENT_BOUND = new Set(["workspace_id"]);

const isJson = (type) => /^application\/(.+\+)?json\b/i.test(type);

export function buildModel(spec, config) {
  const problems = [];
  const where = (m, p, o) => `${m.toUpperCase()} ${p} (${o?.operationId ?? "no operationId"})`;

  const resolvePointer = (ref) => {
    if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined;
    let node = spec;
    for (const raw of ref.slice(2).split("/")) {
      const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      if (node == null || typeof node !== "object" || !(key in node)) return undefined;
      node = node[key];
    }
    return node;
  };
  const deref = (s) => {
    let cur = s;
    for (let i = 0; cur && cur.$ref && i < 20; i++) cur = resolvePointer(cur.$ref);
    return cur;
  };
  const refName = (s) => (s?.$ref?.startsWith("#/components/schemas/") ? s.$ref.slice("#/components/schemas/".length) : undefined);

  // Walk a schema tree, calling visit(schema, pointer) on every node; reports unresolved $refs.
  const walk = (schema, label, visit, seen = new Set(), at = "") => {
    if (!schema || typeof schema !== "object") return;
    if (schema.$ref) {
      const target = resolvePointer(schema.$ref);
      if (target === undefined) return problems.push(`${label}: unresolved $ref ${schema.$ref}${at ? ` at ${at}` : ""}`);
      if (seen.has(schema.$ref)) return;
      return walk(target, label, visit, new Set(seen).add(schema.$ref), at || schema.$ref);
    }
    visit(schema, at);
    for (const [k, v] of Object.entries(schema.properties ?? {})) walk(v, label, visit, seen, `${at}.${k}`);
    if (schema.items) walk(schema.items, label, visit, seen, `${at}[]`);
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") walk(schema.additionalProperties, label, visit, seen, `${at}{}`);
    for (const k of ["allOf", "oneOf", "anyOf"]) (schema[k] ?? []).forEach((s, i) => walk(s, label, visit, seen, `${at}.${k}[${i}]`));
  };

  // Scope config: { name: { bind: [...], args: "positional" | { field: param }, actor?: bool, doc } }
  const scopes = Object.entries(config.scopes ?? {}).map(([name, s]) => ({ name, ...s, key: [...s.bind].sort().join(",") }));
  const scopeByKey = new Map(scopes.map((s) => [s.key, s]));

  const ops = [];
  const seenNames = new Map();
  for (const path of Object.keys(spec.paths ?? {}).sort()) {
    const item = spec.paths[path];
    for (const m of HTTP) {
      const op = item?.[m];
      if (!op) continue;
      const w = where(m, path, op);
      const x = op["x-pc-sdk"];
      if (x === false) continue;
      if (!x || typeof x !== "object") {
        problems.push(`${w}: missing x-pc-sdk (add @SdkMethod or @SdkExclude in the API)`);
        continue;
      }
      const { resource, method } = x;
      // An empty resource puts the method on the root of the bound scope (`auth.consumer(slug).signin()`).
      const segs = resource === "" ? [] : typeof resource === "string" ? resource.split(".") : [];
      if ((resource !== "" && !segs.length) || !segs.every((s) => IDENT.test(s)) || !IDENT.test(method ?? "")) {
        problems.push(`${w}: x-pc-sdk resource/method must be camelCase identifiers, got ${JSON.stringify({ resource, method })}`);
        continue;
      }
      for (const n of [...segs, method]) if (RESERVED.has(n)) problems.push(`${w}: "${n}" is reserved by hand-written code (section 3.5)`);
      if (method === "unwrap" && segs[segs.length - 1] === "webhooks") problems.push(`${w}: "webhooks.unwrap" is reserved for webhook verification`);
      if (BANNED_VERBS.has(method)) problems.push(`${w}: verb "${method}" is not in the closed vocabulary (section 3.2 rule 4)`);
      if (VERB_HTTP[method] && !VERB_HTTP[method].includes(m)) problems.push(`${w}: "${method}" cannot be a ${m.toUpperCase()} (section 3.2)`);

      const name = segs.length ? `${resource}.${method}` : method;

      const params = (op.parameters ?? []).map((p) => (p.$ref ? deref(p) ?? (problems.push(`${w}: unresolved parameter $ref ${p.$ref}`), {}) : p));
      const pathParams = params.filter((p) => p.in === "path");
      const templateNames = [...path.matchAll(/\{([^}]+)\}/g)].map((g) => g[1]);
      for (const t of templateNames) if (!pathParams.some((p) => p.name === t)) problems.push(`${w}: path parameter {${t}} is not declared`);
      const bind = Array.isArray(x.bind) ? x.bind : [];
      for (const b of bind) if (!templateNames.includes(b)) problems.push(`${w}: bind "${b}" is not a path parameter`);
      const scopeBind = bind.filter((b) => !CLIENT_BOUND.has(b));
      let scope = null;
      if (scopeBind.length) {
        scope = scopeByKey.get([...scopeBind].sort().join(",")) ?? null;
        if (!scope) problems.push(`${w}: bind ${JSON.stringify(scopeBind)} has no scope in this surface's gen-sdk config`);
      }
      if (!segs.length && !scope) problems.push(`${w}: an empty x-pc-sdk resource is only valid inside a bound scope`);
      // Names the surface's hand-written code owns on this scope (or the client root): SURFACES `members`.
      const owned = new Set(scope ? scope.members ?? [] : config.members ?? []);
      const top = segs.length ? segs[0] : method;
      if (owned.has(top)) problems.push(`${w}: "${top}" is owned by hand-written code on ${scope ? `${scope.name}(…)` : "the client"} (SURFACES members)`);
      // Unique per scope (as openapi-audit checks): `social.webhooks.endpoints.list` and
      // `social.community(id).webhooks.endpoints.list` are different methods.
      const scopedName = `${scope?.name ?? ""}:${name}`;
      if (seenNames.has(scopedName)) problems.push(`${w}: name collision, ${scope ? `${scope.name}(…).` : ""}${name} is also ${seenNames.get(scopedName)}`);
      seenNames.set(scopedName, op.operationId);
      // Positional arguments: every unbound path parameter, outermost first.
      const positional = templateNames
        .filter((n) => !bind.includes(n))
        .map((n) => {
          const p = pathParams.find((q) => q.name === n) ?? { name: n };
          // x-pc-sdk.args (`@SdkArgs`) names an argument whose parameter name says too little (`mid` -> `messageId`).
          const arg = x.args?.[n] ?? camel(n);
          if (!/^[a-z][A-Za-z0-9]*$/.test(arg)) problems.push(`${w}: x-pc-sdk.args.${n} "${arg}" is not a camelCase name`);
          return { name: n, arg, description: p.description, schema: p.schema ?? { type: "string" }, example: p.example };
        });
      for (const a of Object.keys(x.args ?? {})) if (!templateNames.includes(a) || bind.includes(a)) problems.push(`${w}: x-pc-sdk.args names "${a}", which is not a positional path parameter`);
      if (new Set(positional.map((p) => p.arg)).size !== positional.length) problems.push(`${w}: two positional arguments share a name`);
      // Section 3.2: an id-less DELETE has no default; "delete" must name one object.
      if (method === "delete" && positional.length === 0) {
        problems.push(`${w}: DELETE without an id cannot be "delete"; name it with @SdkMethod (e.g. "erase")`);
      }

      const query = params.filter((p) => p.in === "query").map((p) => ({ name: p.name, required: !!p.required, schema: p.schema ?? {}, description: p.description, example: p.example }));
      const headers = params.filter((p) => p.in === "header");
      const idempotent = headers.some((h) => h.name.toLowerCase() === "idempotency-key");
      for (const h of headers) {
        if (h.required && h.name.toLowerCase() !== "idempotency-key") problems.push(`${w}: required header "${h.name}" is not supported by the generator`);
      }

      let body = null;
      if (op.requestBody) {
        const rb = op.requestBody.$ref ? deref(op.requestBody) : op.requestBody;
        const types = Object.keys(rb?.content ?? {});
        const jsonType = types.find(isJson);
        if (jsonType) {
          const schema = rb.content[jsonType].schema ?? {};
          const resolved = deref(schema) ?? {};
          const isObject = resolved.type === "object" || !!resolved.properties || !!resolved.allOf;
          body = { json: true, contentKey: jsonType, required: rb.required !== false, schema, isObject, properties: Object.keys(resolved.properties ?? {}), requiredProps: resolved.required ?? [] };
          walk(schema, w, (s, at) => {
            const objectish = s.type === "object" || (!s.type && !s.properties && !s.items && !s.allOf && !s.oneOf && !s.anyOf && !s.enum && !s.$ref && Object.keys(s).length === 0);
            if (objectish && !s.properties && !s.allOf && !s.oneOf && !s.anyOf && s.additionalProperties === undefined) {
              problems.push(`${w}: request body object${at ? ` at ${at}` : ""} has no properties and no additionalProperties (generates Record<string, never>; declare additionalProperties: true)`);
            }
          });
          if (!isObject && query.length) problems.push(`${w}: a non-object JSON body cannot be merged with query parameters`);
          const clash = query.filter((q) => body.properties.includes(q.name)).map((q) => q.name);
          if (clash.length) problems.push(`${w}: query and body both declare ${clash.join(", ")}`);
        } else if (types.includes("multipart/form-data") && deref(rb.content["multipart/form-data"].schema)?.properties) {
          // A form upload: typed fields (binary ones as Blob/File), sent as FormData.
          const resolved = deref(rb.content["multipart/form-data"].schema);
          const req = resolved.required ?? [];
          const fields = Object.entries(resolved.properties).map(([name, f]) => {
            const fs = deref(f) ?? {};
            return { name, binary: fs.format === "binary", required: req.includes(name), description: fs.description, schema: fs };
          });
          const clash = query.filter((q) => fields.some((f) => f.name === q.name)).map((q) => q.name);
          if (clash.length) problems.push(`${w}: query and form both declare ${clash.join(", ")}`);
          body = { json: false, multipart: true, required: rb.required !== false, contentType: "multipart/form-data", fields, properties: fields.map((f) => f.name), requiredProps: req };
        } else if (types.length) {
          body = { json: false, required: rb.required !== false, contentType: types[0] };
        }
      }

      // Success response: the lowest 2xx.
      const codes = Object.keys(op.responses ?? {}).sort();
      const okCode = codes.find((c) => /^2\d\d$/.test(c));
      let success = { status: okCode ? Number(okCode) : 200, kind: "void" };
      if (okCode) {
        const r = deref(op.responses[okCode]) ?? {};
        const types = Object.keys(r.content ?? {});
        const jsonType = types.find(isJson);
        if (okCode === "204" || types.length === 0) success = { status: Number(okCode), kind: "void" };
        else if (jsonType) {
          const schema = r.content[jsonType].schema ?? {};
          walk(schema, w, () => {});
          success = { status: Number(okCode), kind: "json", contentKey: jsonType, schema, ref: refName(schema), example: r.content[jsonType].example };
        } else success = { status: Number(okCode), kind: "raw", contentType: types[0], example: r.content[types[0]].schema?.example };
      }
      for (const c of codes) for (const v of Object.values(deref(op.responses[c])?.content ?? {})) walk(v.schema, w, () => {});

      const errors = codes
        .filter((c) => /^[45]\d\d$/.test(c))
        .map((c) => {
          const r = deref(op.responses[c]) ?? {};
          return { status: Number(c), description: r.description ?? "", codes: r["x-pc-error-codes"] ?? [] };
        });

      const paginated = x.paginated === true;
      if (paginated) {
        const s = success.kind === "json" ? deref(success.schema) : undefined;
        if (!s?.properties?.data || deref(s.properties.data)?.type !== "array" || !s.properties.pagination) {
          problems.push(`${w}: x-pc-sdk.paginated but the response is not { data: [], pagination }`);
        }
      }
      let poll = null;
      if (x.poll) {
        const s = success.kind === "json" ? deref(success.schema) : undefined;
        if (method !== "retrieve" || m !== "get") problems.push(`${w}: x-pc-sdk.poll is only valid on a retrieve`);
        else if (!s?.properties?.[x.poll.field]) problems.push(`${w}: x-pc-sdk.poll.field "${x.poll.field}" is not in the response`);
        else if (!Array.isArray(x.poll.terminal) || !x.poll.terminal.length) problems.push(`${w}: x-pc-sdk.poll.terminal is empty`);
        else {
          poll = { field: x.poll.field, terminal: [...x.poll.terminal] };
          // `result`: a free-form object the caller types (`createAndPoll<T>`).
          if (x.poll.result !== undefined) {
            const r = deref(s.properties[x.poll.result]);
            if (typeof x.poll.result !== "string" || !r) problems.push(`${w}: x-pc-sdk.poll.result "${x.poll.result}" is not in the response`);
            else if (r.type !== "object" || r.properties || r.additionalProperties === false) problems.push(`${w}: x-pc-sdk.poll.result "${x.poll.result}" is not a free-form object`);
            else poll.result = x.poll.result;
          }
        }
      }

      const queryHasActor = query.some((q) => q.name === "actor_id");
      const bodyHasActor = body?.json && body.properties.includes("actor_id");
      const actor = bodyHasActor && queryHasActor ? "both" : bodyHasActor ? "body" : queryHasActor ? "query" : null;

      const stem = typeStem(resource);
      ops.push({
        operationId: op.operationId, http: m.toUpperCase(), path, resource, segs, method, name, call: name,
        summary: op.summary ?? "", description: op.description && op.description !== op.summary ? op.description : "",
        deprecated: !!op.deprecated, public: x.public === true, scope, bind, positional, query, body, idempotent,
        success, errors, paginated, poll, actor,
        credentials: credentialsOf(op, spec),
        paramsType: body || query.length ? `${stem}${pascal(method)}Params` : null,
        pathParamSchemas: Object.fromEntries(pathParams.map((p) => [p.name, p.schema ?? { type: "string" }])),
        // Parameter-level `example` (OpenAPI puts it beside the schema, not in it).
        pathParamExamples: Object.fromEntries(pathParams.filter((p) => p.example !== undefined).map((p) => [p.name, p.example])),
        requiredNames: [...((body?.json || body?.multipart) && body.required ? body.requiredProps : []), ...query.filter((q) => q.required).map((q) => q.name)],
        hasRequiredParams: (body?.required && (body.multipart ? body.requiredProps.length > 0 : !body.json || !body.isObject || hasRequired(deref(body.schema)))) || query.some((q) => q.required),
        stem,
        // x-pc-sdk.aliases: former names in this scope, kept as deprecated alias methods.
        aliases: Array.isArray(x.aliases) ? [...x.aliases] : [],
      });
    }
  }

  // A resource.method that exists in more than one scope: the scoped copies' type names
  // carry the scope (`Social.CommunityScopedWebhookEndpointCreateParams`; "Scoped" keeps them apart from a root `communities.*` stem), the root keeps the plain name.
  const scopesByName = new Map();
  for (const o of ops) scopesByName.set(o.name, (scopesByName.get(o.name) ?? 0) + 1);
  for (const o of ops) {
    if (!o.scope || scopesByName.get(o.name) < 2) continue;
    o.stem = `${pascal(o.scope.name)}Scoped${o.stem}`;
    if (o.paramsType) o.paramsType = `${o.stem}${pascal(o.method)}Params`;
  }

  // Resource names must not collide with method names on the same node.
  const resourceSet = new Set();
  for (const o of ops) for (let i = 1; i <= o.segs.length; i++) resourceSet.add(`${o.scope?.name ?? ""}:${o.segs.slice(0, i).join(".")}`);
  for (const o of ops) if (resourceSet.has(`${o.scope?.name ?? ""}:${o.resource}.${o.method}`)) problems.push(`${o.http} ${o.path} (${o.operationId}): method ${o.name} collides with a resource of the same name`);
  for (const s of scopes) {
    const head = (s.accessor || s.name).split(".")[0];
    if (ops.some((o) => !o.scope && (o.segs[0] ?? o.method) === head)) problems.push(`scope accessor "${head}" collides with a root resource`);
  }

  // Public types: models (x-pc-sdk-model), named enums, the error-code enum.
  const schemas = spec.components?.schemas ?? {};
  const models = [];
  const enums = [];
  let errorCode = null;
  for (const name of Object.keys(schemas).sort()) {
    const s = schemas[name];
    const openEnum = s["x-pc-open-enum"] === true && s.anyOf?.find((a) => Array.isArray(a.enum));
    if (openEnum && /ErrorCode$/.test(name)) {
      errorCode = { schema: name, values: [...openEnum.enum], descriptions: s["x-enum-descriptions"] ?? {} };
      continue;
    }
    if (Array.isArray(s.enum) && s.enum.every((v) => typeof v === "string")) {
      enums.push({ name: s["x-pc-sdk-model"] ?? name, schema: name, values: [...s.enum], description: s.description });
    } else if (s["x-pc-sdk-model"]) {
      // x-pc-sdk-model-aliases: names the type had in published SDKs, kept as deprecated aliases.
      const aliases = Array.isArray(s["x-pc-sdk-model-aliases"]) ? [...s["x-pc-sdk-model-aliases"]].sort() : [];
      models.push({ name: s["x-pc-sdk-model"], schema: name, description: s.description, aliases, interface: interfaceable(s) });
    }
  }

  // Webhook events from x-webhooks (or OpenAPI 3.1 `webhooks`).
  const hooks = spec["x-webhooks"] ?? spec.webhooks ?? {};
  const webhooks = Object.keys(hooks).sort().map((type) => {
    const post = hooks[type]?.post ?? {};
    const schema = Object.entries(post.requestBody?.content ?? {}).find(([t]) => isJson(t))?.[1]?.schema;
    const sname = refName(schema);
    if (!sname || !schemas[sname]) problems.push(`webhook ${type}: payload must be a $ref to a component schema`);
    const typeName = schemas[sname]?.["x-pc-sdk-model"] ?? `${pascal(type)}Event`;
    return { type, schema: sname, typeName, summary: post.summary ?? "", description: post.description ?? "" };
  });

  // Every public type name must be unique.
  const typeNames = new Map();
  const claim = (n, what) => {
    if (typeNames.has(n)) problems.push(`type name collision: ${n} is both ${typeNames.get(n)} and ${what}`);
    else typeNames.set(n, what);
  };
  // Names the generator itself emits into every product namespace.
  for (const n of ["Open", "WithLastResponse", "WithOptionalActor", "WithResult", "RequestOptions", "PollOptions", "ClientOptions", "Page", "PagePromise", "APIPromise", "WithResponse", "RateLimitInfo", "LastResponse", "ErrorCode", "UnwrapWebhookEvent", "UnknownWebhookEvent", "WebhookUnwrapParams", "WebhookSignParams"]) claim(n, "a generator helper type");
  for (const mdl of models) claim(mdl.name, `model ${mdl.schema}`);
  for (const mdl of models) for (const a of mdl.aliases) claim(a, `former name of model ${mdl.name}`);
  for (const e of enums) claim(e.name, `enum ${e.schema}`);
  for (const o of ops) {
    if (o.paramsType) claim(o.paramsType, `params of ${o.name}`);
    o.responseType = null;
    o.itemType = null;
    if (o.success.kind === "json") {
      const mdl = o.success.ref && models.find((x) => x.schema === o.success.ref);
      if (o.paginated) {
        const items = deref(deref(o.success.schema)?.properties?.data)?.items;
        const im = refName(items) && models.find((x) => x.schema === refName(items));
        o.itemType = im ? im.name : `${o.stem}${pascal(o.method)}Item`;
        if (!im) claim(o.itemType, `item of ${o.name}`);
      } else if (mdl) o.responseType = mdl.name;
      else {
        o.responseType = `${o.stem}${pascal(o.method)}Response`;
        claim(o.responseType, `response of ${o.name}`);
      }
    }
  }
  for (const h of webhooks) if (!models.some((x) => x.name === h.typeName)) claim(h.typeName, `webhook ${h.type}`);

  // The API's own WebhookEventType enum (section 9.6) wins; otherwise the generator emits one.
  const apiEventTypes = enums.some((e) => e.name === "WebhookEventType");
  if (!apiEventTypes && webhooks.length) claim("WebhookEventType", "the generated webhook event-type union");

  const compat = resolveCompat(config.compat, ops, scopes, problems, resourceSet);
  const renamed = renamedAliases(ops, problems, resourceSet, compat.aliases);
  for (const a of renamed) for (const t of a.types) claim(t.name, `former type name of ${a.target.name}`);
  compat.aliases.push(...renamed);

  if (problems.length) throw new GenError(problems);
  return { apiEventTypes, ops, scopes, models, enums, errorCode, webhooks, deref, compat, securitySchemes: namedSchemes(spec) };
}

/**
 * Frozen 0.x names (Auth's compat.json, docs/sdk-standard.md section 6): each one maps to an
 * operationId or to hand-written code. Names the generator already produces in the same scope need
 * nothing; every other operation name becomes a deprecated alias method, in its 0.x namespace.
 */
function resolveCompat(compat, ops, scopes, problems, resourceSet) {
  if (!compat) return { aliases: [], types: [] };
  const aliases = [];
  const byId = new Map(ops.map((o) => [o.operationId, o]));
  for (const [scopeKey, names] of Object.entries(compat.methods ?? {})) {
    const scope = scopeKey === "root" ? null : scopes.find((s) => s.name === scopeKey);
    if (scopeKey !== "root" && !scope) {
      problems.push(`compat: unknown scope "${scopeKey}"`);
      continue;
    }
    for (const name of Object.keys(names).sort()) {
      const entry = names[name];
      if (entry.handwritten) continue;
      const op = byId.get(entry.operationId);
      if (!op) {
        problems.push(`compat ${scopeKey}:${name}: operationId ${entry.operationId} is not a generated operation`);
        continue;
      }
      if ((op.scope?.name ?? null) === (scope?.name ?? null) && op.call === name) continue;
      const segs = name.split(".");
      const method = segs.pop();
      const where = `${scope?.name ?? ""}:${name}`;
      if (resourceSet.has(where) || ops.some((o) => (o.scope?.name ?? null) === (scope?.name ?? null) && o.call === name)) {
        problems.push(`compat ${scopeKey}:${name}: collides with a generated name`);
        continue;
      }
      const scopeBind = scope ? scope.bind : [];
      const templateNames = [...op.path.matchAll(/\{([^}]+)\}/g)].map((g) => g[1]);
      const missing = (op.scope?.bind ?? []).filter((b) => !scopeBind.includes(b));
      if (missing.length) {
        problems.push(`compat ${scopeKey}:${name}: ${op.name} needs ${missing.join(", ")}, which ${scope ? `${scope.name}(…)` : "the client"} does not bind`);
        continue;
      }
      const bind = templateNames.filter((n) => scopeBind.includes(n) || op.bind.includes(n));
      const positional = op.positional.filter((p) => !scopeBind.includes(p.name));
      const args = entry.args ?? "positional";
      if (args !== "positional" && args !== "object") problems.push(`compat ${scopeKey}:${name}: args must be "positional" or "object"`);
      aliases.push({ scope, segs, method, name, target: op, args, alias: { ...op, scope, bind, positional } });
    }
  }
  const types = Object.entries(compat.types ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, schema]) => ({ name, schema }));
  return { aliases, types };
}

/**
 * Renamed methods (x-pc-sdk.aliases, `@SdkMethod(…, { was })`): each former name becomes a
 * deprecated alias in the same scope that calls the renamed operation, so the rename is a minor.
 */
function renamedAliases(ops, problems, resourceSet, existing) {
  const out = [];
  const taken = new Set(existing.map((a) => `${a.scope?.name ?? ""}:${a.name}`));
  for (const op of ops) {
    for (const name of op.aliases) {
      const where = `${op.scope?.name ?? ""}:${name}`;
      const segs = name.split(".");
      const method = segs.pop();
      if (!segs.length || !/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/.test(name)) {
        problems.push(`${op.http} ${op.path} (${op.operationId}): x-pc-sdk.aliases entry "${name}" must be a dotted resource.method`);
        continue;
      }
      if (taken.has(where) || resourceSet.has(where) || ops.some((o) => (o.scope?.name ?? null) === (op.scope?.name ?? null) && o.call === name)) {
        problems.push(`${op.http} ${op.path} (${op.operationId}): alias ${name} collides with a generated name`);
        continue;
      }
      taken.add(where);
      // The former name's generated type names (`Mail.MessageTimelineParams`) stay too, as deprecated aliases.
      const stem = typeStem(segs.join("."));
      const types = [];
      if (op.paramsType) types.push({ name: `${stem}${pascal(method)}Params`, target: op.paramsType });
      if (op.responseType && /Response$/.test(op.responseType)) types.push({ name: `${stem}${pascal(method)}Response`, target: op.responseType });
      if (op.itemType && /Item$/.test(op.itemType)) types.push({ name: `${stem}${pascal(method)}Item`, target: op.itemType });
      out.push({ scope: op.scope, segs, method, name, target: op, args: "positional", alias: op, renamed: true, types: types.filter((t) => t.name !== t.target) });
    }
  }
  return out;
}

/** A model schema TypeScript can declare as an `interface … extends` (a plain object, no composition or null). */
function interfaceable(s) {
  if (s.nullable || s.oneOf || s.anyOf || s.allOf || s.not) return false;
  const type = Array.isArray(s.type) ? s.type : [s.type];
  if (type.includes("null")) return false;
  return (s.type === "object" || (s.type === undefined && s.properties)) && !!s.properties && Object.keys(s.properties).length > 0;
}

function hasRequired(schema) {
  return Array.isArray(schema?.required) && schema.required.length > 0;
}

/** The request-defaults rule (section 3.4): defaulted fields become required in response-only schemas. */
export function applyResponseDefaults(spec) {
  const out = structuredClone(spec);
  const schemas = out.components?.schemas ?? {};
  const reach = (root, acc) => {
    const visit = (s) => {
      if (!s || typeof s !== "object") return;
      if (s.$ref?.startsWith("#/components/schemas/")) {
        const n = s.$ref.slice(21);
        if (acc.has(n)) return;
        acc.add(n);
        return visit(schemas[n]);
      }
      for (const v of Object.values(s.properties ?? {})) visit(v);
      visit(s.items);
      if (typeof s.additionalProperties === "object") visit(s.additionalProperties);
      for (const k of ["allOf", "oneOf", "anyOf"]) (s[k] ?? []).forEach(visit);
    };
    visit(root);
  };
  const req = new Set();
  const res = new Set();
  const inlineRes = [];
  for (const item of Object.values(out.paths ?? {})) {
    for (const m of HTTP) {
      const op = item?.[m];
      if (!op) continue;
      for (const p of op.parameters ?? []) reach(p.schema, req);
      for (const c of Object.values(op.requestBody?.content ?? {})) reach(c.schema, req);
      for (const r of Object.values(op.responses ?? {})) {
        for (const c of Object.values(r.content ?? {})) {
          reach(c.schema, res);
          if (c.schema && !c.schema.$ref) inlineRes.push(c.schema);
        }
      }
    }
  }
  const promote = (s) => {
    if (!s || typeof s !== "object" || s.$ref) return;
    const defaulted = Object.entries(s.properties ?? {}).filter(([, v]) => v && v.default !== undefined).map(([k]) => k);
    if (defaulted.length) s.required = [...new Set([...(s.required ?? []), ...defaulted])];
    for (const v of Object.values(s.properties ?? {})) promote(v);
    promote(s.items);
  };
  for (const n of [...res].sort()) if (!req.has(n)) promote(schemas[n]);
  for (const s of inlineRes) promote(s);
  return out;
}

/**
 * The spec's security schemes, when it names more than one: an API whose routes
 * take different credentials (Auth: workspace key, end-user token, app API key,
 * M2M token) says which per operation, and the docs repeat it. One scheme
 * carries no information, so it yields none.
 */
function namedSchemes(spec) {
  const schemes = spec.components?.securitySchemes ?? {};
  return Object.keys(schemes).length > 1 ? schemes : null;
}

/** The scheme names an operation accepts (alternatives), `optional` when `{}` is one of them; null without named schemes. */
function credentialsOf(op, spec) {
  if (!namedSchemes(spec) || !Array.isArray(op.security) || op.security.length === 0) return null;
  const names = [...new Set(op.security.flatMap((r) => Object.keys(r ?? {})))];
  if (names.length === 0) return null;
  const schemes = namedSchemes(spec);
  return {
    names,
    optional: op.security.some((r) => r && Object.keys(r).length === 0),
    descriptions: Object.fromEntries(names.map((n) => [n, String(schemes[n]?.description ?? "").trim()])),
  };
}
