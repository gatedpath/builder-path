"use client";

import { explainError } from "@gatedpath/frontend-kit";

/**
 * The plain words for a failed write, from the failure table every part of the tool shares
 * (@gatedpath/agent-rules): what happened, why, and where to read. A NotEligible revert shows
 * as "The contract refused this wallet…" instead of a hex selector; a wallet rejection, a wrong
 * chain and an empty balance each get their own sentence. Anything the table doesn't know shows
 * the error's own message, never a guess.
 */
export function FailureWords({ error, className = "rb-elig-muted" }: { error: unknown; className?: string }) {
  const e = explainError(error);
  if (e.kind === "unknown") return <p className={className}>{e.raw}</p>;
  return (
    <p className={className}>
      {e.plainWords} {e.cause}{" "}
      {e.fix.link && (
        <a href={e.fix.link} target="_blank" rel="noreferrer">
          Read more
        </a>
      )}
    </p>
  );
}
