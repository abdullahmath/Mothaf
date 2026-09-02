/**
 * No-op stand-in for the `server-only` package.
 *
 * The real package throws on import. That is exactly what we want inside the
 * application — it turns "this server module got pulled into a client bundle"
 * from a silent leak into a build failure — but it also fires in plain Node,
 * where a CLI script imports the same server modules on purpose.
 *
 * Command-line scripts (`db:migrate`, `db:seed`) and the test runner alias the
 * package here. The application build does not, so the guard stays live where
 * it matters.
 */
export {};
