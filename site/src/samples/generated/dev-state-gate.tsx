"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// The dev state panel from @gatedpath/frontend-kit/dev, and only in the dev server. next.config.ts
// inlines NEXT_PUBLIC_LOCAL_DEPLOYMENT as the contents of deployments/local.json when `npm run dev`
// wrote it, and as "" in every other phase. The bundler sees a string literal in the condition
// below, treats the import branch as dead in a production build, and ships nothing of the panel.
// Keep the env read inside the condition: wrapping it (Boolean(...), a helper) hides the constant
// from the bundler and the chunk comes back. The scaffolder's integration test builds this app
// with a local.json present and asserts the bundle is clean.
export const DevState: ComponentType = process.env.NEXT_PUBLIC_LOCAL_DEPLOYMENT
  ? dynamic(() => import("./DevStatePanelLoader").then((m) => m.DevStatePanelLoader), { ssr: false })
  : () => null;
