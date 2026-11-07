# Migrating to @productcraft/auth-passport 2.0

`@productcraft/auth-passport` 2.0 has **the same API as 1.0**. Its `@productcraft/auth` peer range moved from `^1.0.1` (1.0.1) to `^1.1.0` when Auth 1.1.0 was released, and changesets published that as a major. No code changes.

```bash
npm install @productcraft/auth@^1.1 @productcraft/auth-passport@^2
```

The release process has since been fixed so a peer-dependency bump inside the peer range no longer makes a new auth-passport major.
