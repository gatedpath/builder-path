# IssuerRegistry

Which addresses may mint, for how long, and how much. An abstract mixin on `AccessControl` that
`GatedERC20` inherits; it holds one permission per issuer and the token spends it on every mint.

## Why a window and an allowance

On Redbelly the issuer of an asset is typically a business that has been through business
verification: a `BusinessIdentifier` contract with representative and delegate wallets, where the
delegates get network write access as sub-accounts of the business (RESEARCH.md question 25).
Those delegate wallets are the ones that will call `mint`. People leave, laptops get lost, a
tranche closes. A permission that expires by itself and stops at a number is one fewer thing the
issuer admin has to remember to take away, and a monitor can alert on `IssuerPermissionSet` when a
window looks too long or an allowance too large for the tranche it is meant for.

## Surface

```solidity
struct IssuerPermission { uint64 validFrom; uint64 validUntil; uint256 allowance; uint256 minted; }

function setIssuer(address issuer, uint64 validFrom, uint64 validUntil, uint256 allowance) external; // ISSUER_ADMIN_ROLE
function revokeIssuer(address issuer) external;                                                       // ISSUER_ADMIN_ROLE
function issuerPermission(address issuer) external view returns (IssuerPermission memory);
function isActiveIssuer(address issuer) public view returns (bool);
function remainingIssuance(address issuer) public view returns (uint256);
function canIssue(address issuer, uint256 amount) external view returns (bool);
```

`validFrom` of zero means now. `validUntil` is exclusive and must be after both `validFrom` and now;
a window that ends before it opens is refused with `InvalidIssuerWindow`. Setting a permission for
an issuer that already has one replaces it and resets `minted` to zero, and the event carries the
new window so the log shows the replacement. `revokeIssuer` deletes the record.

The token's `mint` and `distribute` call `_consumeIssuance(msg.sender, amount)`, which reverts with
`IssuerNotActive` outside the window and `IssuerAllowanceExceeded(issuer, requested, remaining)`
past the cap, and emits `IssuanceConsumed(issuer, amount, remaining)` on success. `distribute`
charges only what actually landed; skipped recipients cost the issuer nothing.

Nobody mints without a permission, the admin included. Roles do not imply mint rights.

## Timestamps

The window compares `block.timestamp` with the stored bounds. Slither and forge's linter both flag
that, and the suppressions are inline with the reason: the window is measured in hours to years,
the few seconds a block producer could shift a timestamp by do not change whether a permission is
open, and Redbelly's DBFT has no single proposer who could shift it anyway (RESEARCH.md question 5).
Blocks on Redbelly are produced on demand, so a window's end is not "the next block after" but "the
next block anyone produces after"; nothing here depends on a block arriving at any particular time.

## Tests

`test/IssuerRegistry.t.sol`: role checks, window validation, zero `validFrom`, the three phases of a
window (before, inside, the exclusive end), allowance spending and bounds, replacement resetting
`minted`, revocation, and a fuzz over window length, allowance and eight mint requests at random
times asserting the total never exceeds the allowance and the counter matches. The invariant suites
in `GatedERC20.invariants.t.sol` keep `issuerMinted <= issuerAllowance` across random sequences that
include re-issuing.
