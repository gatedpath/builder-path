// AssemblyScript handlers for the GatedERC20 data source. The generated bindings under
// `generated/` come from `graph codegen` against abis/GatedERC20.json (the contract kit's
// exported ABI); until you run it this file does not compile, which is the point of a template.
import { BigInt, Bytes, ethereum, crypto, ByteArray } from "@graphprotocol/graph-ts";
import {
  EligibilityDenied,
  ForcedTransfer as ForcedTransferEvent,
  IssuerPermissionRevoked,
  IssuerPermissionSet,
  Paused,
  RequestIdChanged,
  RoleGranted,
  RoleRevoked,
  Transfer as TransferEvent,
  Unpaused,
  VerifierChanged,
} from "../generated/GatedERC20/GatedERC20";
import {
  Denial,
  ForcedTransfer,
  Holder,
  IssuerPermission,
  PauseEvent,
  RoleChange,
  Token,
  Transfer,
  VerifierChange,
} from "../generated/schema";

const ZERO = Bytes.fromHexString("0x0000000000000000000000000000000000000000");

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
}

function token(event: ethereum.Event): Token {
  const id = event.address.toHexString();
  let t = Token.load(id);
  if (t == null) {
    t = new Token(id);
    t.totalSupply = BigInt.zero();
    t.holderCount = 0;
    t.paused = false;
    t.verifier = ZERO;
    t.requestId = BigInt.zero();
    t.transferCount = 0;
    t.forcedTransferCount = 0;
  }
  return t as Token;
}

function holder(t: Token, address: Bytes, block: BigInt): Holder {
  const id = address.toHexString();
  let h = Holder.load(id);
  if (h == null) {
    h = new Holder(id);
    h.token = t.id;
    h.balance = BigInt.zero();
    h.firstSeenBlock = block;
    h.lastActiveBlock = block;
    h.transfersIn = 0;
    h.transfersOut = 0;
  }
  return h as Holder;
}

function roleName(role: Bytes): string {
  const hex = role.toHexString();
  if (hex == "0x0000000000000000000000000000000000000000000000000000000000000000") return "DEFAULT_ADMIN_ROLE";
  const names = ["PAUSER_ROLE", "COMPLIANCE_ROLE", "ISSUER_ADMIN_ROLE"];
  for (let i = 0; i < names.length; i++) {
    if (crypto.keccak256(ByteArray.fromUTF8(names[i])).toHexString() == hex) return names[i];
  }
  return hex;
}

export function handleTransfer(event: TransferEvent): void {
  const t = token(event);
  const amount = event.params.value;
  const isMint = event.params.from.equals(ZERO);
  const isBurn = event.params.to.equals(ZERO);
  if (isMint) t.totalSupply = t.totalSupply.plus(amount);
  if (isBurn) t.totalSupply = t.totalSupply.minus(amount);
  if (!isMint) {
    const from = holder(t, event.params.from, event.block.number);
    const wasHolding = from.balance.gt(BigInt.zero());
    from.balance = from.balance.minus(amount);
    from.transfersOut += 1;
    from.lastActiveBlock = event.block.number;
    if (wasHolding && from.balance.equals(BigInt.zero())) t.holderCount -= 1;
    from.save();
  }
  if (!isBurn) {
    const to = holder(t, event.params.to, event.block.number);
    const wasHolding = to.balance.gt(BigInt.zero());
    to.balance = to.balance.plus(amount);
    to.transfersIn += 1;
    to.lastActiveBlock = event.block.number;
    if (!wasHolding && to.balance.gt(BigInt.zero())) t.holderCount += 1;
    to.save();
  }
  t.transferCount += 1;
  t.save();

  const tr = new Transfer(eventId(event));
  tr.token = t.id;
  tr.from = event.params.from;
  tr.to = event.params.to;
  tr.amount = amount;
  tr.kind = isMint ? "mint" : isBurn ? "burn" : "transfer";
  tr.block = event.block.number;
  tr.timestamp = event.block.timestamp;
  tr.txHash = event.transaction.hash;
  tr.save();
}

export function handleForcedTransfer(event: ForcedTransferEvent): void {
  const t = token(event);
  t.forcedTransferCount += 1;
  t.save();
  const f = new ForcedTransfer(eventId(event));
  f.token = t.id;
  f.from = event.params.from;
  f.to = event.params.to;
  f.amount = event.params.amount;
  f.justificationHash = event.params.justificationHash;
  f.officer = event.params.officer;
  f.block = event.block.number;
  f.timestamp = event.block.timestamp;
  f.txHash = event.transaction.hash;
  f.save();
}

export function handleIssuerPermissionSet(event: IssuerPermissionSet): void {
  const t = token(event);
  const id = event.params.issuer.toHexString();
  let p = IssuerPermission.load(id);
  if (p == null) p = new IssuerPermission(id);
  p.token = t.id;
  p.validFrom = event.params.validFrom;
  p.validUntil = event.params.validUntil;
  p.allowance = event.params.allowance;
  p.active = true;
  p.setAtBlock = event.block.number;
  p.txHash = event.transaction.hash;
  p.save();
}

export function handleIssuerPermissionRevoked(event: IssuerPermissionRevoked): void {
  const p = IssuerPermission.load(event.params.issuer.toHexString());
  if (p == null) return;
  p.active = false;
  p.txHash = event.transaction.hash;
  p.save();
}

function pauseEvent(event: ethereum.Event, paused: boolean, account: Bytes): void {
  const t = token(event);
  t.paused = paused;
  t.save();
  const p = new PauseEvent(eventId(event));
  p.token = t.id;
  p.paused = paused;
  p.account = account;
  p.block = event.block.number;
  p.timestamp = event.block.timestamp;
  p.txHash = event.transaction.hash;
  p.save();
}

export function handlePaused(event: Paused): void {
  pauseEvent(event, true, event.params.account);
}

export function handleUnpaused(event: Unpaused): void {
  pauseEvent(event, false, event.params.account);
}

function roleChange(event: ethereum.Event, role: Bytes, account: Bytes, sender: Bytes, granted: boolean): void {
  const t = token(event);
  const r = new RoleChange(eventId(event));
  r.token = t.id;
  r.role = role;
  r.roleName = roleName(role);
  r.account = account;
  r.sender = sender;
  r.granted = granted;
  r.block = event.block.number;
  r.timestamp = event.block.timestamp;
  r.txHash = event.transaction.hash;
  r.save();
}

export function handleRoleGranted(event: RoleGranted): void {
  roleChange(event, event.params.role, event.params.account, event.params.sender, true);
}

export function handleRoleRevoked(event: RoleRevoked): void {
  roleChange(event, event.params.role, event.params.account, event.params.sender, false);
}

export function handleVerifierChanged(event: VerifierChanged): void {
  const t = token(event);
  t.verifier = event.params.newVerifier;
  t.save();
  const v = new VerifierChange(eventId(event));
  v.token = t.id;
  v.kind = "verifier";
  v.previous = event.params.previousVerifier;
  v.next = event.params.newVerifier;
  v.block = event.block.number;
  v.timestamp = event.block.timestamp;
  v.txHash = event.transaction.hash;
  v.save();
}

export function handleRequestIdChanged(event: RequestIdChanged): void {
  const t = token(event);
  t.requestId = event.params.newRequestId;
  t.save();
  const v = new VerifierChange(eventId(event));
  v.token = t.id;
  v.kind = "requestId";
  v.previous = Bytes.fromByteArray(Bytes.fromBigInt(event.params.previousRequestId));
  v.next = Bytes.fromByteArray(Bytes.fromBigInt(event.params.newRequestId));
  v.block = event.block.number;
  v.timestamp = event.block.timestamp;
  v.txHash = event.transaction.hash;
  v.save();
}

export function handleEligibilityDenied(event: EligibilityDenied): void {
  const t = token(event);
  const d = new Denial(eventId(event));
  d.token = t.id;
  d.wallet = event.params.wallet;
  d.requestId = event.params.requestId;
  d.verifier = event.params.verifier;
  d.block = event.block.number;
  d.timestamp = event.block.timestamp;
  d.txHash = event.transaction.hash;
  d.save();
}
