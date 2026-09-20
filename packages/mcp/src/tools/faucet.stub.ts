// Not registered. PLAN.md section 12.1 lists "request faucet funds" among the MCP tools, and
// RESEARCH.md question 16 asks whether Redbelly would object to a third-party tool driving
// their faucet. Until that answer arrives there is no faucet tool (asked 2026-09-12, came
// back blank 2026-09-17, asked again the same day). What is known (Vine,
// native-currency/testing-coins, 2026-09-12; FAUCETME's front page, 2026-09-15): testnet RBNT
// comes from FAUCETME at https://redbelly.faucetme.pro/ with a Discord login, 500 RBNT per
// claim and one claim per 24 hours, and a nominal amount also arrives at verification.
// FAUCETME publishes its own MCP endpoint, so pointing developers to theirs may be the
// whole answer. A faucet with a web
// login cannot be scripted without either a session cookie or Redbelly's consent, and the
// first is not a thing this server will hold.
//
// When question 16 is answered yes, the tool below is the shape: a public address in, the
// faucet's response out, no key anywhere. Until then docs_lookup("faucet") returns the URL.
export const faucetStub = {
  name: 'request_faucet',
  status: 'not registered',
  blockedOn: 'RESEARCH.md question 16',
  url: 'https://redbelly.faucetme.pro/',
  inputShape: { address: '0x…', chain: 153 },
} as const;
