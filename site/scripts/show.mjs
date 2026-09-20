#!/usr/bin/env node
// Serve the built site (dist/) and keep running, so it can be looked at in a browser.
//   npm run show            then open http://127.0.0.1:4321/
// Build first (npm run build). Uses the same static server the quality scripts use, so what you
// see is what they measured. SITE_PORT picks another port. Ctrl-C stops it.
import { serve, BASE } from './serve.mjs';

// Both loopback addresses: a browser asking for "localhost" may mean ::1, and the quality scripts
// ask for 127.0.0.1. Local only, either way.
await serve('127.0.0.1');
try { await serve('::1'); } catch { /* no IPv6 loopback on this machine; 127.0.0.1 is enough */ }
console.log(`The built site is at ${BASE}/  (Ctrl-C to stop)`);
