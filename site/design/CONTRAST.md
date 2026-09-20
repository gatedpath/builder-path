# Contrast table

Computed 2026-09-12 with the WCAG 2.x relative-luminance formula (sRGB, 2.4 gamma, 0.2126/0.7152/0.0722 weights), not eyeballed. Thresholds: AA is 4.5:1 for text under 24px (or under 18.66px bold), 3:1 for larger text and for non-text UI parts; AAA is 7:1. Every text and background pair named in `DESIGN.md` and `tokens.css` is here. Regenerate with `build_tokens.py` (kept in the session scratchpad; the numbers below are the record).

Result: every text pair and every control border we ship passes AA in both themes. The only rows below 3:1 are the decorative hairlines (card and table rules), which WCAG 1.4.11 does not cover; form controls and focus rings use `hairline-strong` and `focus` instead. Failures among text or control pairs: 0 in light, 0 in dark.

## Our light theme

| Pair | Foreground | Background | Ratio | WCAG 2.2 |
|---|---|---|---|---|
| Body text on page | `text` #283A46 | `bg` #FFFFFF | 11.77:1 | AAA |
| Body text on surface | `text` #283A46 | `surface` #EFF3F6 | 10.55:1 | AAA |
| Strong text on page | `text-strong` #21272A | `bg` #FFFFFF | 15.13:1 | AAA |
| Muted text on page | `text-muted` #4C6B80 | `bg` #FFFFFF | 5.64:1 | AA |
| Muted text on surface | `text-muted` #4C6B80 | `surface` #EFF3F6 | 5.06:1 | AA |
| Heading on page | `heading` #283A46 | `bg` #FFFFFF | 11.77:1 | AAA |
| Link / accent text on page | `accent` #0F766E | `bg` #FFFFFF | 5.47:1 | AA |
| Link / accent on surface | `accent` #0F766E | `surface` #EFF3F6 | 4.91:1 | AA |
| Accent hover on page | `accent-high` #115E59 | `bg` #FFFFFF | 7.58:1 | AAA |
| Accent text on accent-low tint | `accent-high` #115E59 | `accent-low` #CCFBF1 | 6.73:1 | AA |
| Primary button label on accent | `accent-text-on` #FFFFFF | `accent` #0F766E | 5.47:1 | AA |
| Slate button label on slate | `slate-text-on` #FFFFFF | `slate` #395060 | 8.43:1 | AAA |
| Inline code on code bg | `code-text` #283A46 | `code-bg` #F4F4F4 | 10.70:1 | AAA |
| Code block text on block bg | `code-block-text` #EFF3F6 | `code-block-bg` #142530 | 14.08:1 | AAA |
| Testnet pill | `testnet-text` #166534 | `testnet-bg` #DCFCE7 | 6.49:1 | AA |
| Mainnet pill | `mainnet-text` #991B1B | `mainnet-bg` #FEE2E2 | 6.80:1 | AA |
| Note callout | `note-text` #283A46 | `note-bg` #EFF3F6 | 10.55:1 | AAA |
| Tip callout | `tip-text` #134E4A | `tip-bg` #CCFBF1 | 8.41:1 | AAA |
| Caution callout | `caution-text` #78350F | `caution-bg` #FEF3C7 | 8.15:1 | AAA |
| Danger callout | `danger-text` #991B1B | `danger-bg` #FEE2E2 | 6.80:1 | AA |
| For-agents block text | `agents-text` #EFF3F6 | `agents-bg` #142530 | 14.08:1 | AAA |
| For-agents block label | `agents-label` #5EEAD4 | `agents-bg` #142530 | 10.62:1 | AAA |
| Last-verified badge | `verified-text` #283A46 | `verified-bg` #DFE7EC | 9.41:1 | AAA |
| Stale badge | `stale-text` #78350F | `stale-bg` #FEF3C7 | 8.15:1 | AAA |
| Focus ring against page | `focus` #0F766E | `bg` #FFFFFF | 5.47:1 | AA |
| Focus ring against surface | `focus` #0F766E | `surface` #EFF3F6 | 4.91:1 | AA |
| Control border (hairline-strong) against page, non-text 3:1 | `hairline-strong` #848B91 | `bg` #FFFFFF | 3.45:1 | AA large |
| Control border against surface, non-text 3:1 | `hairline-strong` #848B91 | `surface` #EFF3F6 | 3.09:1 | AA large |
| Decorative hairline against page (exempt from 1.4.11, listed for honesty) | `hairline` #DFE7EC | `bg` #FFFFFF | 1.25:1 | FAIL |
| Muted text on nav | `text-muted` #4C6B80 | `bg-nav` #FFFFFF | 5.64:1 | AA |
| Body text on sidebar | `text` #283A46 | `bg-sidebar` #FFFFFF | 11.77:1 | AAA |

## Our dark theme

| Pair | Foreground | Background | Ratio | WCAG 2.2 |
|---|---|---|---|---|
| Body text on page | `text` #DFE7EC | `bg` #142530 | 12.55:1 | AAA |
| Body text on surface | `text` #DFE7EC | `surface` #1C3140 | 10.74:1 | AAA |
| Strong text on page | `text-strong` #FFFFFF | `bg` #142530 | 15.71:1 | AAA |
| Muted text on page | `text-muted` #BFCFD9 | `bg` #142530 | 9.83:1 | AAA |
| Muted text on surface | `text-muted` #BFCFD9 | `surface` #1C3140 | 8.41:1 | AAA |
| Heading on page | `heading` #FFFFFF | `bg` #142530 | 15.71:1 | AAA |
| Link / accent text on page | `accent` #5EEAD4 | `bg` #142530 | 10.62:1 | AAA |
| Link / accent on surface | `accent` #5EEAD4 | `surface` #1C3140 | 9.08:1 | AAA |
| Accent hover on page | `accent-high` #99F6E4 | `bg` #142530 | 12.46:1 | AAA |
| Accent text on accent-low tint | `accent-high` #99F6E4 | `accent-low` #134E4A | 7.52:1 | AAA |
| Primary button label on accent | `accent-text-on` #142530 | `accent` #5EEAD4 | 10.62:1 | AAA |
| Slate button label on slate | `slate-text-on` #FFFFFF | `slate` #395060 | 8.43:1 | AAA |
| Inline code on code bg | `code-text` #EFF3F6 | `code-bg` #283A46 | 10.55:1 | AAA |
| Code block text on block bg | `code-block-text` #EFF3F6 | `code-block-bg` #0C1A24 | 15.83:1 | AAA |
| Testnet pill | `testnet-text` #BBF7D0 | `testnet-bg` #14532D | 7.52:1 | AAA |
| Mainnet pill | `mainnet-text` #FECACA | `mainnet-bg` #7F1D1D | 6.93:1 | AA |
| Note callout | `note-text` #DFE7EC | `note-bg` #1C3140 | 10.74:1 | AAA |
| Tip callout | `tip-text` #CCFBF1 | `tip-bg` #134E4A | 8.41:1 | AAA |
| Caution callout | `caution-text` #FDE68A | `caution-bg` #451A03 | 12.03:1 | AAA |
| Danger callout | `danger-text` #FECACA | `danger-bg` #7F1D1D | 6.93:1 | AA |
| For-agents block text | `agents-text` #EFF3F6 | `agents-bg` #0C1A24 | 15.83:1 | AAA |
| For-agents block label | `agents-label` #5EEAD4 | `agents-bg` #0C1A24 | 11.94:1 | AAA |
| Last-verified badge | `verified-text` #DFE7EC | `verified-bg` #283A46 | 9.41:1 | AAA |
| Stale badge | `stale-text` #FDE68A | `stale-bg` #451A03 | 12.03:1 | AAA |
| Focus ring against page | `focus` #5EEAD4 | `bg` #142530 | 10.62:1 | AAA |
| Focus ring against surface | `focus` #5EEAD4 | `surface` #1C3140 | 9.08:1 | AAA |
| Control border (hairline-strong) against page, non-text 3:1 | `hairline-strong` #848B91 | `bg` #142530 | 4.55:1 | AA |
| Control border against surface, non-text 3:1 | `hairline-strong` #848B91 | `surface` #1C3140 | 3.89:1 | AA large |
| Decorative hairline against page (exempt from 1.4.11, listed for honesty) | `hairline` #395060 | `bg` #142530 | 1.86:1 | FAIL |
| Muted text on nav | `text-muted` #BFCFD9 | `bg-nav` #142530 | 9.83:1 | AAA |
| Body text on sidebar | `text` #DFE7EC | `bg-sidebar` #142530 | 12.55:1 | AAA |

## Redbelly's own pairs, for reference

These are sampled from the live sites so the reader can see why some of Redbelly's choices are not copied. Red on white and white on red both fail AA for normal text; that's the main reason our interactive accent is not Redbelly red.

| Pair | Foreground | Background | Ratio | WCAG 2.2 |
|---|---|---|---|---|
| Body text on white | #000000 | #FFFFFF | 21.00:1 | AAA |
| Nav link text on white | #21272A | #FFFFFF | 15.13:1 | AAA |
| White on red button | #FFFFFF | #FF4646 | 3.38:1 | AA large only |
| Red on white (secondary button label) | #FF4646 | #FFFFFF | 3.38:1 | AA large only |
| Brand red on white | #FF5050 | #FFFFFF | 3.22:1 | AA large only |
| White on slate section | #FFFFFF | #395060 | 8.43:1 | AAA |
| Slate heading on white | #395060 | #FFFFFF | 8.43:1 | AAA |
| Slate text on surface #EFF3F6 | #395060 | #EFF3F6 | 7.56:1 | AAA |
| Muted heading #4C6B80 on white | #4C6B80 | #FFFFFF | 5.64:1 | AA |
| Brand grey #848B91 on white | #848B91 | #FFFFFF | 3.45:1 | AA large only |
| White on footer | #FFFFFF | #263640 | 12.47:1 | AAA |
| White on charcoal | #FFFFFF | #283A46 | 11.77:1 | AAA |
| Vine link/button #0070AF on white | #0070AF | #FFFFFF | 5.33:1 | AA |
| White on Vine button | #FFFFFF | #0070AF | 5.33:1 | AA |
| Vine dark link #29B1FF on #142530 | #29B1FF | #142530 | 6.60:1 | AA |
| Ecosystem tag teal on white | #0A9F95 | #FFFFFF | 3.28:1 | AA large only |

Sources: `redbelly.network` computed styles and `_next/static/css/*.css` (button `#ff4646`, hover `#ff7373`, sections `#395060`, footer `#263640`, text `#21272a`); `redbelly.network/brand` colour palette (`#FF5050`, `#283A46`, `#FA423C`, `#142530`, `#848B91`, `#D9D9D9`, `#ECEBEC`); `vine.redbelly.network/stylesheets/extra.css` (`#0070AF`, `#00527F`, `#29B1FF`); `redbelly.network/ecosystem` tag colour `#0A9F95`. All read on 2026-09-12.
