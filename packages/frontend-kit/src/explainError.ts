// explainError: a viem or wagmi error in, the plain words from the shared failure table out. The
// same table the MCP server's explain_failure reads (@gatedpath/agent-rules/failures), so a page
// shows the words an agent would see instead of a hex revert. Pure: no network, no React.
//
// What it decodes: a ContractFunctionRevertedError (NotEligible by selector or by the decoded
// error name, the deploy script's Error(string) reasons, ZeroVerifier), a user rejection in the
// wallet, a wrong or unswitchable chain, and not enough RBNT for gas. Anything else comes back as
// kind "unknown" with the error's own message, never a guess.
import {
  decodeRevertData,
  failureByKind,
  matchErrorName,
  matchText,
  notEligibleEntry,
  revertHexIn,
  ELIGIBILITY_STATUS_NAMES,
} from '@gatedpath/agent-rules/failures';
import type { EligibilityStatusName, FailureEntry } from '@gatedpath/agent-rules/failures';

export interface ExplainedError {
  /** A kind from the failure table, or "unknown". */
  kind: string;
  plainWords: string;
  cause: string;
  fix: { command?: string; link?: string };
  /** The table entry's heading, when known. */
  title?: string;
  /** The site page for this kind, when known. */
  docsPage?: string;
  /** `NotEligible(wallet, requestId)` arguments when they could be read from the revert. */
  notEligible?: { wallet: string; requestId: string };
  /** The revert selector when the error carried revert data. */
  selector?: string;
  /** The error's own words, shortened, for a details line. */
  raw: string;
}

export interface ExplainErrorOptions {
  /**
   * The credential state behind a NotEligible revert, when the page already knows it (from
   * `receptorMockStatus` on a ReceptorMock, or the dev state panel). Picks the entry for that
   * state; a real verifier cannot tell, so leave it unset there.
   */
  eligibilityStatus?: EligibilityStatusName | number | null;
}

interface ErrorLike {
  name?: string;
  message?: string;
  shortMessage?: string;
  details?: string;
  cause?: unknown;
  code?: number;
  data?: unknown;
  raw?: unknown;
  signature?: unknown;
  reason?: unknown;
}

function chain(error: unknown): ErrorLike[] {
  const out: ErrorLike[] = [];
  let e: unknown = error;
  for (let i = 0; i < 12 && e && typeof e === 'object'; i++) {
    out.push(e as ErrorLike);
    e = (e as ErrorLike).cause;
  }
  return out;
}

function words(error: unknown): string {
  if (typeof error === 'string') return error;
  const parts = chain(error).flatMap((e) => [e.shortMessage, e.details, e.message]).filter((s): s is string => typeof s === 'string' && s.length > 0);
  return parts.join('\n');
}

function fromEntry(entry: FailureEntry, raw: string, extra: Partial<ExplainedError> = {}): ExplainedError {
  return {
    kind: entry.kind,
    plainWords: entry.plainWords,
    cause: entry.cause,
    fix: { ...(entry.fix.command ? { command: entry.fix.command } : {}), ...(entry.fix.link ? { link: entry.fix.link } : {}) },
    title: entry.title,
    docsPage: entry.docsPage,
    raw: raw.slice(0, 600),
    ...extra,
  };
}

function statusName(status: ExplainErrorOptions['eligibilityStatus']): EligibilityStatusName | null {
  if (status === null || status === undefined) return null;
  if (typeof status === 'number') return ELIGIBILITY_STATUS_NAMES[status] ?? null;
  return status;
}

/** Explains an error from wagmi's `useWriteContract`, viem's clients, or anything with a `cause` chain. */
export function explainError(error: unknown, options: ExplainErrorOptions = {}): ExplainedError {
  const raw = words(error);
  const links = chain(error);

  // 1. Revert data on a ContractFunctionRevertedError (or anything carrying `raw`/`data` hex).
  for (const e of links) {
    const hex = typeof e.raw === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(e.raw) ? e.raw : typeof e.data === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(e.data) ? e.data : null;
    const decodedByViem = e.data && typeof e.data === 'object' && typeof (e.data as { errorName?: unknown }).errorName === 'string' ? (e.data as { errorName: string; args?: readonly unknown[] }) : null;
    if (decodedByViem?.errorName === 'NotEligible') {
      const [wallet, requestId] = decodedByViem.args ?? [];
      const entry = notEligibleEntry(statusName(options.eligibilityStatus));
      return fromEntry(entry, raw, {
        selector: hex ? hex.slice(0, 10).toLowerCase() : undefined,
        notEligible: { wallet: String(wallet ?? '').toLowerCase(), requestId: String(requestId ?? '') },
      });
    }
    if (hex) {
      const decoded = decodeRevertData(hex);
      if (decoded?.kind === 'not-eligible') {
        const entry = notEligibleEntry(statusName(options.eligibilityStatus));
        return fromEntry(entry, raw, { selector: decoded.selector, ...(decoded.notEligible ? { notEligible: decoded.notEligible } : {}) });
      }
      if (decoded?.kind) return fromEntry(failureByKind(decoded.kind)!, raw, { selector: decoded.selector });
      if (decoded) {
        const byText = matchText(raw);
        if (byText) return fromEntry(byText, raw, { selector: decoded.selector });
        return { kind: 'unknown', plainWords: "This failure isn't in the table, so there are no plain words for it yet.", cause: `The contract reverted with selector ${decoded.selector}, which the table doesn't know.`, fix: {}, selector: decoded.selector, raw: raw.slice(0, 600) };
      }
    }
    if (decodedByViem && decodedByViem.errorName === 'ZeroVerifier') return fromEntry(failureByKind('zero-verifier')!, raw);
    if (typeof e.reason === 'string') {
      const byReason = matchText(e.reason);
      if (byReason) return fromEntry(byReason, raw);
    }
  }

  // 2. viem's own classes, by name along the cause chain (the wallet's 4001 arrives as UserRejectedRequestError).
  for (const e of links) {
    const byName = typeof e.name === 'string' ? matchErrorName(e.name) : undefined;
    if (byName) return fromEntry(byName, raw);
    if (e.code === 4001) return fromEntry(failureByKind('user-rejected')!, raw);
  }

  // 3. Revert data quoted inside a message (a node's `execution reverted: custom error 0x…` text).
  const quoted = revertHexIn(raw);
  if (quoted) {
    const decoded = decodeRevertData(quoted);
    if (decoded?.kind === 'not-eligible') {
      const entry = notEligibleEntry(statusName(options.eligibilityStatus));
      return fromEntry(entry, raw, { selector: decoded.selector, ...(decoded.notEligible ? { notEligible: decoded.notEligible } : {}) });
    }
    if (decoded?.kind) return fromEntry(failureByKind(decoded.kind)!, raw, { selector: decoded.selector });
  }

  // 4. The words themselves.
  const byText = matchText(raw);
  if (byText) return fromEntry(byText, raw);
  return {
    kind: 'unknown',
    plainWords: "This failure isn't in the table, so there are no plain words for it yet.",
    cause: 'Nothing in the failure table matched the error. Its own message is in raw.',
    fix: {},
    raw: raw.slice(0, 600) || String(error),
  };
}
