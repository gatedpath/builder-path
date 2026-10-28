# Run record: how a Foundry keystore behaves (for the developer wallet page)

Run on 21 September 2026 on macOS, `cast` 1.7.1, in an empty temporary folder that was deleted
afterwards. The wallet was generated for this run, never funded, never linked to any identity and
never used on any network. No existing key was imported or read. Paths are shortened to `<folder>`.

## What was run, and what it printed

```sh
cast wallet new keystores throwaway-demo --unsafe-password "run-record-only"
```

```
Created new encrypted keystore file: <folder>/keystores/throwaway-demo
Address:    0x5Be833Eba507869e9B1822EF575bF5B5069ccaa4
```

The private key is not printed. `--unsafe-password` puts the password on the command line, which is
acceptable only for a wallet that is thrown away, as here. For a real wallet the password is typed
at the prompt.

```sh
cast wallet list --dir keystores
```

```
0xthrowaway-demo (Local)
```

`cast` 1.7.1 prints the account's name with `0x` in front of it. It is the name, not an address.

```sh
cast wallet address --keystore keystores/throwaway-demo --password "run-record-only"
```

```
0x5Be833Eba507869e9B1822EF575bF5B5069ccaa4
```

## What the keystore file holds

The file is JSON with three top-level fields: `crypto`, `id` and `version`. Inside `crypto`, the
cipher is `aes-128-ctr` and the key derivation is `scrypt`. The private key appears nowhere in the
file in the clear; it is the ciphertext, and the password is what stands between the file and the key.

## File permissions

`cast wallet new` wrote the file as `-rw-r--r--`: readable by every account on the machine. After
`chmod 600` it read `-rw-------`, and `cast wallet address` still returned the same address.

## Not run

`cast wallet import <name> --interactive` was not run. It asks for an existing private key, and the
sessions that build this site hold none.
