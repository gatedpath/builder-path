// Option model shared by the argument parser, the prompts and the generator.
// Every prompt has a flag, so `--yes` plus flags is a complete non-interactive path.

export const TEMPLATES = Object.freeze({
  'gated-erc20': {
    label: 'Gated ERC-20 (subscription token; transfers need both parties eligible)',
    ready: true,
    contract: 'GatedERC20',
  },
  'gated-erc721': {
    label: 'Gated ERC-721 (stub: not shipped yet)',
    ready: false,
    contract: 'GatedERC721',
    missing: [
      'src/GatedERC721.sol on the Gated base with eligibility checked on mint and transfer',
      'five-state tests on GatedTest for mint, transfer and approve paths',
      'a fuzz test over token ids and an invariant that no ineligible wallet holds a token',
      'the web app gated action (mint one unit) and its ABI',
    ],
  },
  'gated-vault': {
    label: 'Gated vault (stub: not shipped yet)',
    ready: false,
    contract: 'GatedVault',
    missing: [
      'src/GatedVault.sol: ERC-4626 on the Gated base with deposit, withdraw and share transfer gated',
      'a decision on what happens to shares when a holder is revoked (freeze, custody, or stay put)',
      'five-state tests on GatedTest, a fuzz test over deposit amounts, an invariant that assets equal the sum of share claims',
      'the web app gated action (deposit) and its ABI',
    ],
  },
  empty: {
    label: 'Empty (Foundry project with the Gated base wired and one example gated function)',
    ready: true,
    contract: 'GatedExample',
  },
});

export const PACKAGE_MANAGERS = Object.freeze({
  npm: { run: 'npm run', exec: 'npx', install: 'npm install', lock: 'package-lock.json' },
  pnpm: { run: 'pnpm', exec: 'pnpm exec', install: 'pnpm install', lock: 'pnpm-lock.yaml' },
  yarn: { run: 'yarn', exec: 'yarn', install: 'yarn install', lock: 'yarn.lock' },
});

export const DEFAULTS = Object.freeze({
  template: 'gated-erc20',
  packageManager: 'npm',
  hardhat: false,
  web: true,
  install: false,
});

export const HELP = `create-redbelly-dapp: scaffold an identity-gated dApp for Redbelly Network

Usage
  create-redbelly-dapp [project-name] [options]

Options
  --template <name>       gated-erc20 | gated-erc721 | gated-vault | empty   (default: gated-erc20)
  --pm <name>             npm | pnpm | yarn                                   (default: npm)
  --hardhat / --no-hardhat  add a Hardhat 3 view of the same sources in hardhat/  (default: no; Foundry only)
  --web / --no-web        include the Next.js web app                         (default: yes)
  --yes, -y               accept defaults for every prompt not given as a flag
  --install               run the package manager and forge install afterwards (the only network step)
  --force                 write into a non-empty directory
  --list-templates        print the templates and exit
  --help, -h              this text
  --version, -v           print the version

Nothing here makes a network call unless --install is given. No key is read, written or asked for.
`;
