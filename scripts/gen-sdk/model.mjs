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
const VERB_HTTP = { list: ["get"], create: ["post"], retrieve: ["get"], update: ["patch", "put"], delete: ["delete"], export: ["get"], erase: ["delete"] };
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
      const segs = typeof resource === "string" ? resource.split(".") : [];
      if (!segs.length || !segs.every((s) => IDENT.test(s)) || !IDENT.test(method ?? "")) {
        problems.push(`${w}: x-pc-sdk resource/method must be camelCase identifiers, got ${JSON.stringify({ resource, method })}`);
        continue;
      }
      for (const n of [...segs, method]) if (RESERVED.has(n)) problems.push(`${w}: "${n}" is reserved by hand-written code (section 3.5)`);
      if (method === "unwrap" && segs[segs.length - 1] === "webhooks") problems.push(`${w}: "webhooks.unwrap" is reserved for webhook verification`);
      if (BANNED_VERBS.has(method)) problems.push(`${w}: verb "${method}" is not in the closed vocabulary (section 3.2 rule 4)`);
      if (VERB_HTTP[method] && !VERB_HTTP[method].includes(m)) problems.push(`${w}: "${method}" cannot be a ${m.toUpperCase()} (section 3.2)`);

      const name = `${resource}.${method}`;
      if (seenNames.has(name)) problems.push(`${w}: name collision, ${name} is also ${seenNames.get(name)}`);
      seenNames.set(name, op.operationId);

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
      // Positional arguments: every unbound path parameter, outermost first.
      const positional = templateNames
        .filter((n) => !bind.includes(n))
        .map((n) => {
          const p = pathParams.find((q) => q.name === n) ?? { name: n };
          return { name: n, arg: camel(n), description: p.description, schema: p.schema ?? { type: "string" } };
        });
      // Section 3.2: an id-less DELETE has no default; "delete" must name one object.
      if (method === "delete" && positional.length === 0) {
        problems.push(`${w}: DELETE without an id cannot be "delete"; name it with @SdkMethod (e.g. "erase")`);
      }

      const query = params.filter((p) => p.in === "query").map((p) => ({ name: p.name, required: !!p.required, schema: p.schema ?? {}, description: p.description }));
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
        else poll = { field: x.poll.field, terminal: [...x.poll.terminal] };
      }

      const queryHasActor = query.some((q) => q.name === "actor_id");
      const bodyHasActor = body?.json && body.properties.includes("actor_id");
      const actor = bodyHasActor && queryHasActor ? "both" : bodyHasActor ? "body" : queryHasActor ? "query" : null;

      const stem = typeStem(resource);
      ops.push({
        operationId: op.operationId, http: m.toUpperCase(), path, resource, segs, method, name,
        summary: op.summary ?? "", description: op.description && op.description !== op.summary ? op.description : "",
        deprecated: !!op.deprecated, public: x.public === true, scope, bind, positional, query, body, idempotent,
        success, errors, paginated, poll, actor,
        paramsType: body || query.length ? `${stem}${pascal(method)}Params` : null,
        pathParamSchemas: Object.fromEntries(pathParams.map((p) => [p.name, p.schema ?? { type: "string" }])),
        requiredNames: [...(body?.json && body.required ? body.requiredProps : []), ...query.filter((q) => q.required).map((q) => q.name)],
        hasRequiredParams: (body?.required && (!body.json || !body.isObject || hasRequired(deref(body.schema)))) || query.some((q) => q.required),
        stem,
      });
    }
  }

  // Resource names must not collide with method names on the same node.
  const resourceSet = new Set();
  for (const o of ops) for (let i = 1; i <= o.segs.length; i++) resourceSet.add(`${o.scope?.name ?? ""}:${o.segs.slice(0, i).join(".")}`);
  for (const o of ops) if (resourceSet.has(`${o.scope?.name ?? ""}:${o.resource}.${o.method}`)) problems.push(`${o.http} ${o.path} (${o.operationId}): method ${o.name} collides with a resource of the same name`);
  for (const s of scopes) if (ops.some((o) => !o.scope && o.segs[0] === s.name)) problems.push(`scope accessor "${s.name}" collides with a root resource`);

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
      models.push({ name: s["x-pc-sdk-model"], schema: name, description: s.description });
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
  for (const n of ["Open", "WithLastResponse", "WithOptionalActor", "RequestOptions", "PollOptions", "ErrorCode", "UnwrapWebhookEvent", "UnknownWebhookEvent", "WebhookUnwrapParams"]) claim(n, "a generator helper type");
  for (const mdl of models) claim(mdl.name, `model ${mdl.schema}`);
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

  if (problems.length) throw new GenError(problems);
  return { apiEventTypes, ops, scopes, models, enums, errorCode, webhooks, deref };
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
