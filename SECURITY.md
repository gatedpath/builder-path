# Security

These packages are supposed to be in front of contracts that hold value, so if something is wrong
here I want to know about it quickly.

## If you find a problem

Please do not open a public issue for it. Use the private reporting on this repo provided by
GitHub: open the **Security** tab, and choose **Report a vulnerability**. Tell me what you found,
how I can reproduce it, and what package and version it is in. I will get back to you, and I am
happy to credit you if you would like that.

Do not put a private key, a seed phrase or an access token in a report, an issue or a pull request.
If you think one of yours has leaked, treat it as compromised and move whatever it controls before
you do anything else.

## What I care about most

The nine packages in `packages/`, the project the scaffolder produces, and the deploy scripts. The
faults that worry me are ones where a guard passes without doing the thing it is there to do. That
means the mainnet deploy checks, the pre-flight secret scan, and the eligibility gate on the token.
The other kind is anything that could make a tool print, log or store a secret.

## What the kit does and does not do with keys

Nothing here reads a private key from a file, an environment variable or a prompt, and nothing asks
you for one. When something has to sign, it takes the name of a Foundry keystore account (or a
hardware wallet path) and hands the signing to `forge` or `cast`, which prompt you for the keystore
password themselves. The MCP server holds no key and has no tool that takes one. The scaffold's
`.gitignore` keeps `.env` out of your repository, and the pre-flight scans your project for anything
that looks like a key, a seed phrase or a token before you deploy.

Three things the tools do refuse on your behalf. The deploy script will not broadcast on mainnet (151)
without a Safe 1.4.1 as admin, a real verifier contract, a deployer that passes the network's
permission check and a ship report dated today. The mock verifier will not deploy on 151 at all. And
since 0.2.3 the ship report written into `contracts/deployments/` names your project by its last two
path segments and your keystore by `--account <keystore-name>`, never by a path on your machine, so
the file can go into a public repository. The terminal output and the JSON keep the real values.

Each project repository under `gatedpath` carries a `THREAT-MODEL.md` with the same list of
network-specific threats: the verifier contract as a dependency you did not write, wallet compromise
as identity impersonation, credential expiry and revocation races, a single official RPC, inclusion
as finality, gas-limit exhaustion inside one transaction, and replay between 153 and 151.

## What has been reviewed so far

An internal audit found twelve faults of exactly that kind in 0.1.x on 19 September 2026. Each one
is fixed in 0.2.0, starting from a test that failed first, and 0.1.x is deprecated on npm. Versions
0.2.2 and 0.2.3 (October 2026) fixed three more that the first real deploys showed: a deploy command
that rehearsed as Foundry's default sender when `--sender` was missing, a dry run that wrote a
deployment record indistinguishable from a real one, and a ship report that wrote my machine's path
and keystore name into a file meant to be published. Every version before 0.2.3 is deprecated.

There has not been an external audit. This project has deployed to testnet 153 only, six contracts of
mine with verified source, and nothing to mainnet.

## Which versions get fixes

The newest published version of each package. An older version is deprecated with a notice pointing
you at the fix. It doesn't get a patch of its own.
