"use client";

import "@gatedpath/frontend-kit/dev.css";
import { DevStatePanel, parseLocalDeployment } from "@gatedpath/frontend-kit/dev";

// Loaded by DevState.tsx through a dynamic import that exists only in the dev server. The panel
// itself refuses to render unless the connected chain is 31337, so even a stale local.json can
// never put it on a page that talks to 151 or 153.
export function DevStatePanelLoader() {
  const deployment = parseLocalDeployment(process.env.NEXT_PUBLIC_LOCAL_DEPLOYMENT);
  if (!deployment) return null;
  return <DevStatePanel deployment={deployment} />;
}
