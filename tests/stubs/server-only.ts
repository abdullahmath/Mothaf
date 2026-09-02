// The real `server-only` package throws if it is reached from a client bundle.
// Vitest runs everything on the server, so this stub simply satisfies the
// import without changing behaviour.
export {};
