/** @type {import('next').NextConfig} */
const nextConfig = {
  // The game is a single imperative controller that mutates the DOM by id after
  // a one-time React render. Strict Mode's double-invoke of effects would boot
  // the controller twice in dev (duplicate listeners / a second AudioContext),
  // so it is disabled — there is no React state to double-check anyway.
  reactStrictMode: false,

  // Pin the workspace root to this project. A stray lockfile in the home dir
  // otherwise makes Next guess the wrong root for Turbopack.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
