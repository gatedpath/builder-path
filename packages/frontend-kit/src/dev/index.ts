// `@gatedpath/frontend-kit/dev`: the local-loop pieces (PLAN.md 18.1). Import this path only from
// code a dev server runs; the scaffold's `web/src/components/DevState.tsx` does, behind a build-time
// check that leaves nothing of it in a production bundle.
export { DevStatePanel } from './DevStatePanel.js';
export type { DevStatePanelProps } from './DevStatePanel.js';
export { anvilAccountConnector, anvilAccountConnectors } from './anvilConnector.js';
export type { AnvilAccountConnectorOptions } from './anvilConnector.js';
export { parseLocalDeployment, ELIGIBILITY_STATES, LOCAL_CHAIN_ID } from './localDeployment.js';
export type { LocalDeployment, LocalWallet, EligibilityStateName } from './localDeployment.js';
