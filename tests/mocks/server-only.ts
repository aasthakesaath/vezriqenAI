/**
 * `server-only` throws when Vitest resolves it through its browser condition.
 * The guard it provides is a build-time one for Next.js; under test the modules
 * that import it run in Node anyway, so a no-op is the faithful stand-in.
 */
export {};
