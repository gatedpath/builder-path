## The five steps

1. **Confirm.** Open the transaction on Routescan (the alert carries the link). Read the block
   number and the sender. Check the timelock's pending operations and the Safe's transaction
   history: was this scheduled and executed by us? If yes, close the alert with the operation id.
   Ten minutes, no more; if you cannot confirm it was ours in ten minutes, it wasn't.

2. **Stop.** Send `pause()` from the pauser Safe. One transaction; blocks on Redbelly are produced
   on demand, so it lands in the next block anyone produces, usually within seconds. Confirm with
   `cast call <token> "paused()(bool)"` and write down the block number. Everything stops:
   transfers, mints, burns, forced transfers. Admin actions still work, and that is what step 3
   needs.

3. **Contain.** From the Safe that holds the relevant admin role, take away the lever that was
   misused: `revokeIssuer` for a rogue issuer (issuer admin, at once), `revokeRole` for a
   compromised operational role (that goes through the timelock; the token is paused while it
   waits). If the verifier is wrong, schedule `setVerifier` back to the right one. If the
   governance Safe itself is compromised, keep the token paused (the attacker needs the timelock
   to unpause, and the timelock needs its delay) and go to step 5 with lawyers.

4. **Tell people.** Holders see a paused token on Routescan before they see your message; get
   ahead of it. One paragraph: what happened as far as you know, that balances are unchanged,
   when the next update is. Regulators and the issuer's compliance officer get the same paragraph
   plus the block numbers.

5. **Recover and record.** Schedule the fix and the `unpause` as one timelock batch so they
   land together; execute after the delay; confirm `paused()` is false and read `isEligible` on a
   known-good and a known-bad wallet. Write the record: the alert, the blocks, every transaction
   hash, who decided what and when, and the one thing you will change so it does not happen
   again. Put the record next to this file.
