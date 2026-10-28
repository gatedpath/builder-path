# Run record: a Foundry project pinned to an older compiler takes the gate

Run on 26 September 2026 on macOS: `forge` 1.7.1, `@gatedpath/receptor-mock` 0.2.1 from the public
npm registry. This closes the case the run of 21 September could not reach ("only 0.8.30 was
installed on the machine, and the attempt stopped before it reached the clash").

## The project

The stock `forge init` project (`Counter`, `pragma solidity ^0.8.13`), with one line added to the
`[profile.default]` section of its `foundry.toml`:

```
solc = "0.8.25"
```

Then, as in the run of 21 September: `npm init -y`, `npm install --save-dev
@gatedpath/receptor-mock@0.2.1` (one package, no dependencies of its own), the three remappings, and
`Counter` inheriting `Gated` with `gated` on `increment` and `_authorizeVerifierChange` checking an
owner.

## What happened

```
$ forge build
Error: Encountered invalid solc version in node_modules/@gatedpath/receptor-mock/src/Gated.sol:
No solc version exists that matches the version requirement: =0.8.30
```

11.3 seconds, most of it forge asking the compiler list, and it stopped before compiling anything.
No compiler was downloaded: `~/.svm` was empty afterwards. The refusal is at version resolution,
not at the clash between two pragmas, because `Gated.sol` says `pragma solidity 0.8.30;` exactly and
the project's pin excludes it.

## What it means

What the `/teams/` page read from the source is now measured: a project whose `foundry.toml` pins a
compiler other than 0.8.30 cannot build with the gate until it moves the pin. The error names the
file and the requirement, so the fix is one line and the message says which. Removing the pin (or
setting it to `0.8.30`) is the whole change; the project's own `^0.8.13` files compile under 0.8.30
unchanged.

Not run, still: a project that takes OpenZeppelin as a git submodule, a project with CI of its own,
Hardhat.
