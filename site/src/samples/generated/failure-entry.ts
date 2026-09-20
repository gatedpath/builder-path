export interface FailureEntry {
  /** Stable kebab-case id. Anchors on the site's /errors page and the `kind` every decoder returns. */
  readonly kind: string;
  readonly group: FailureGroup;
  /** A short heading. */
  readonly title: string;
  /** What happened, in one or two plain sentences. */
  readonly plainWords: string;
  /** Why it happened. */
  readonly cause: string;
  /** The next thing to run, or the page that says what to do. One or both. */
  readonly fix: { readonly command?: string; readonly link?: string };
  /** Site page the entry belongs on, as a path. The /errors page lists every entry as well. */
  readonly docsPage: string;
  /** A docs_lookup topic in the MCP server, when the network fact behind the entry has one. */
  readonly topic?: string;
  /** `measured` when the exact shape was captured from a real run; `pending` when it is the best reading so far. */
  /**
   * `measured`: we saw it ourselves, and `measured` says where. `reported`: someone else saw it and
   * published where; we have not, and `reportedBy` credits them. `pending`: nobody we know of has.
   */
  readonly status: 'measured' | 'reported' | 'pending';
  /** For `reported` entries: whose observation this is. Never a substitute for seeing it ourselves. */
  readonly reportedBy?: { readonly who: string; readonly url: string; readonly date: string };
  /** Where and when the shape was seen, or what is still missing. */
  readonly measured: string;
  readonly match: readonly FailureMatcher[];
}
