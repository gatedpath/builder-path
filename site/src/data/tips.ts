// Directions for the pills that mark work the tool cannot do for the reader: a step that is
// theirs alone, or a step nobody has run against a real network yet. One or two sentences each.
// A direction says what to do, where, and what it unlocks; it does not repeat the page.
//
// Every fact in a tip is already on the page that carries its pill, with its date and source.
// A tip restates; it never introduces. `tip` is an editable field, so this copy goes through
// "Website Text Edits" like the rest of the site's prose.
//
// A key is used at most once per page, because it becomes the tooltip's element id.
export const pillTips: { key: string; tip: string }[] = [
  // ---- the page pill beside a title (PageTitle.astro): which network the page is written for
  {
    key: 'page-mainnet',
    tip: 'This page is written for a contract on mainnet, chain 151. Every run recorded on it so far was read-only or on a local chain; nothing of mine is deployed there yet.',
  },
  {
    key: 'page-testnet',
    tip: 'This page is written for testnet, chain 153. The runs on it were on a fork or read-only against the real RPC; the real deploy is still yours to make.',
  },
  // ---- steps that are the reader's alone (the "Your step" pills on the golden path)
  {
    key: 'verify-wallet',
    tip: 'Do this yourself at access.redbelly.network: a passport and a biometric check, once. No tool here can do it for you, and every later step reads the result.',
  },
  {
    key: 'faucet',
    tip: 'Claim at redbelly.faucetme.pro with a Discord login: 500 RBNT per claim, one claim per 24 hours, as read on 15 September 2026. The local loop in step 6 needs none.',
  },
  {
    key: 'github-token',
    tip: 'Create it in your own GitHub account with the read:packages scope. An agent cannot obtain it for you, and nothing on this page needs it.',
  },
  {
    key: 'verifier-key',
    tip: 'Ask Redbelly support for it; an agent cannot obtain it. The golden path stops before the SDK on purpose, so you can finish this page without it.',
  },
  // ---- steps nobody has run against a real network yet (the pending pills)
  {
    key: 'keystore-import',
    tip: 'Run this on your own machine with your verified wallet. The key goes into an encrypted keystore, and every tool here only ever takes the account name.',
  },
  {
    key: 'keystore-entry',
    tip: 'Run this on your own machine. The encrypted keystore holds the key, and the config file never does.',
  },
  {
    key: 'verify-hardhat',
    tip: 'There is no dry run for this task, so it has not been rehearsed. If it fails, the Routescan web form takes the standard JSON input from the Foundry dry run.',
  },
  {
    key: 'rpc-error',
    tip: 'If you have a wallet on 153 without write access, send the write from step 12 and keep the exact error. A third party has reported the wording; a capture of our own is the reading this page still lacks.',
  },
  {
    key: 'goldsky-approval',
    tip: 'Ask Redbelly to approve your project on Goldsky before you plan around a subgraph. Until they do, the kit carries a template only.',
  },
  {
    key: 'ship-report-real',
    tip: 'No report exists for a real network yet. The first one is written the day someone runs the ship command with a verified, funded wallet.',
  },
  // ---- things deliberately not built, or not written yet (the labelled draft pills)
  {
    key: 'no-faucet-tool',
    tip: 'Claim from the faucet in your browser instead. The server will not wrap it until Redbelly has said whether it objects.',
  },
  {
    key: 'summaries-pending',
    tip: 'Read these on Redbelly\'s research page for now. Only the four papers summarised above have been worked through here.',
  },
];

export const pillTipFor = new Map(pillTips.map((t) => [t.key, t.tip]));
