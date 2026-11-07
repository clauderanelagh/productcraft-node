# Migrating to @productcraft/auth-passport 1.0

`@productcraft/auth-passport` 1.0 has **the same API as 0.3**. The major exists because of how it depends on Auth:

| | 0.3 | 1.0 |
|---|---|---|
| `@productcraft/auth` | a dependency, `^0.8.0` (installed for you) | a peer dependency, `^1.0.0`: install it yourself |
| CommonJS on Node 20.3+ | threw `ERR_REQUIRE_ESM` below Node 20.19 | works |

To upgrade, move both packages together:

```bash
npm install @productcraft/auth@^1 @productcraft/auth-passport@^1
```

`createAuthJwtStrategy(scope, verify, options)` and `createPassportSecretOrKeyProvider(scope)` take and return the same things. The `ConsumerScope` you pass in comes from `new Auth().consumer("my-app-slug")` in both versions. For the Auth 0.8 to 1.0 changes in the rest of your code, see the [Auth 1.0 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-1.0.0.md).
