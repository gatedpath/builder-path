# Design system for the Redbelly Development Tool site

Written 12 September 2026 for whoever builds the site in Astro Starlight. The owner's instruction was
to take the look, feel, fonts and layout from https://redbelly.network/ and to stay visibly a
builder site for Redbelly rather than Redbelly itself. This document records what the live sites
actually do, value by value, and then says what we take, what we change, and why. `tokens.css` and
`tokens.json` carry the same numbers; `CONTRAST.md` has the computed ratios; `screenshots/` has the
evidence.

Read the sources section before trusting any number. Everything was sampled from the DOM or the
shipped CSS on the date given. Nothing is guessed.

## 1. Sources and date

All reads on 12 September 2026, 11:34 to 11:48 UTC, from a cloud session whose network policy
allows Redbelly's hosts.

| Source | What it gave us | How it was read |
|---|---|---|
| https://redbelly.network/ and `/asset-tokenisation`, `/ecosystem`, `/blogs`, `/research` | Look, fonts, palette, layout, components, motion | Playwright computed styles at 1440 and 390 px; the fifteen `_next/static/css/*.css` bundles (345 KB) grepped for rules |
| https://redbelly.network/brand | Official palette and typography rules, logo formats | Page text and colour swatches |
| https://vine.redbelly.network/ | What to look different from | Computed styles; `stylesheets/extra.css` (22 KB, with a design-system header comment) |
| https://docs.redbelly.network/ | Same | Computed styles; `stylesheets/extra.css` (6 KB) |
| Font licences | Readex Pro, Roboto, JetBrains Mono | `OFL.txt` in each upstream GitHub repository; Google Fonts metadata for axes |
| Starlight | Variable names and override points | https://starlight.astro.build/guides/css-and-tailwind/, https://starlight.astro.build/guides/overriding-components/, https://starlight.astro.build/reference/overrides/, and `packages/starlight/src/style/props.css` on GitHub `main`; npm reports `@astrojs/starlight` 0.42.0 on Astro 7.3.2 |

The marketing site is Next.js with CSS Modules (class names like `Button_button__ZIi1r`), GSAP
ScrollTrigger for the pinned roadmap, a Slick carousel for partner logos and Weglot for translation.
Vine and the docs are both MkDocs Material (9.7.7 and 9.5.2). None of that stack carries over; only
the visual decisions do.

## 2. Typography

### What Redbelly uses

One face everywhere: Readex Pro. The marketing site self-hosts it from `/fonts/ReadexPro/` as four
static woff2 files (Regular 36.6 KB, Medium 38.6 KB, SemiBold 38.8 KB, Bold 38.7 KB) declared with
`font-display: swap`. It also declares Roboto Medium (64 KB) but no sampled element renders in it, and
an icon font for the carousel. Vine loads Readex Pro 300/400/700 and Roboto Mono from Google Fonts;
the docs load Readex Pro 300/400/500/700 from Google Fonts and, oddly, set it as the code font too.
The brand kit says: headings Readex Pro Medium in `#283A46` or `#FF5050` on light, `#FFFFFF` or
`#FF5050` on dark; body Medium or Regular in `#283A46`, `#848B91` when necessary.

Sampled scale on `redbelly.network`, desktop (global rules from the CSS bundle, then the computed
overrides that matter):

| Role | Size / line-height / weight | Where |
|---|---|---|
| h1 (global) | 56px / 56px / 500 | `h1` rule; the home page has no h1, its hero is an h2 |
| Hero h2 | 60px / 72px / 500, colour `#4C6B80`, "Red" span in `#FF4646` | home hero "Redbelly Network" |
| h2 (global) | 48px / 57px / 700 | `h2` rule; `/ecosystem` and `/blogs` page titles render 56px / 56px / 500 |
| h3 | 40px / 40px / 500 | section titles "What We Offer", "Our Ecosystem"; colour `#395060` or white on slate |
| h4 | 24px / 30px / 500 | eyebrows "OUR NETWORK", "ABOUT REDBELLY" (colour `#4C6B80`); card titles 24px / 600 / -0.48px |
| Body | 16px / 22px / 400 | `p` rule; computed body font `16px / 22px ReadexPro` |
| Card copy | 14px / 19.6px / 400 / -0.14px, colour `#395060` | roadmap cards |
| Nav links | 17px / 22px / 500, colour `#21272A` | header; dropdown items 15px / 500 |
| Buttons | 14 to 15px / 700 | `.Button_button` |
| Footer headings | 12px / 16.8px / 600 uppercase | `Footer_smallText` |
| Footer links | 14px / 500 white | footer |
| Mobile | hero 40 / 48; h3 32 / 32 or 28 / 28; sections keep 14px copy | 390px sample |

Letter-spacing is `normal` on 136 of 184 sampled text nodes; the negatives are small (-1% at 14px,
-2% on 24px card titles). Vine's h1 is 45px / 700 / -0.04em in grey `#848B91`, body 18px / 1.6.

### What we use

Readex Pro for everything that isn't code, self-hosted as one variable woff2 (wght 160 to 700; the
Google-served latin subset measured 31,428 bytes). Weights in use: 400 body, 500 headings and nav,
600 labels and buttons, 700 only for the site name. Starlight gets it through `--sl-font`.

Code gets JetBrains Mono, also a self-hosted variable latin subset (40,404 bytes measured), weights 400
and 600, through `--sl-font-mono`. That's our choice, not Redbelly's: the marketing site has no code
face, Vine uses Roboto Mono, and picking a third mono is one of the cheap ways a docs site reads as
ours next to theirs.

Type scale, in px at 16px root. Starlight's default steps are kept where they're close and nudged
where the site's own numbers are rounder (their h3 is 40, their h1 is 56):

| Token | px | Use |
|---|---|---|
| `--sl-text-2xs` | 12 | badges, eyebrows, footer small print |
| `--sl-text-xs` | 13 | code in small contexts |
| `--sl-text-sm` | 14 | code blocks, captions, buttons, sidebar |
| `--sl-text-base` | 16 | body |
| `--sl-text-lg` | 18 | h4, lede paragraphs |
| `--sl-text-xl` | 20 | h3 mobile |
| `--sl-text-2xl` | 24 | h2 mobile |
| `--sl-text-3xl` | 28 | h2 desktop |
| `--sl-text-4xl` | 32 | h1 mobile |
| `--sl-text-5xl` | 40 | h1 desktop |
| `--sl-text-6xl` | 56 | landing hero only |

Body line-height 1.6 (Redbelly's 1.375 is a marketing measure; it's too tight for a page of
instructions). Headings 1.15. Heading weight 500 with -0.02em tracking on h1, -0.01em on h2, matching
the marketing site's medium-weight titles rather than Vine's bold ones. Eyebrow labels are 12px / 600
/ uppercase / +0.04em, straight from their footer and section labels. Buttons 14px / 600.

### Licences

| Face | Licence | Evidence | Verdict |
|---|---|---|---|
| Readex Pro | SIL Open Font License 1.1, reserved name "RevReading Lexend" | `ThomasJockin/readexpro` `OFL.txt` | Free to self-host, subset and redistribute; don't rename it |
| Roboto (Medium, loaded but unused by them) | SIL OFL 1.1 since the 2023 relicensing | `googlefonts/roboto-3-classic` `OFL.txt` | Not needed |
| Roboto Mono (Vine) | SIL OFL 1.1 | Google Fonts | Not used, on purpose |
| JetBrains Mono | SIL OFL 1.1 | `JetBrains/JetBrainsMono` `OFL.txt` | Free to self-host and subset |
| slick (icon font) | MIT, part of slick-carousel | Not needed | |

No commercial or Adobe fonts anywhere on the three sites, so no metric-compatible substitute is
needed. If Readex Pro ever became a problem, Lexend (OFL, same designers, same skeleton) is the
drop-in; it's what Readex Pro was derived from.

## 3. Colour

### What Redbelly uses

Light by default on all three properties; none of them ships a `prefers-color-scheme` rule, though
Vine and the docs have MkDocs dark palettes behind a toggle. Sampled from the home page DOM and CSS,
with the brand kit alongside:

| Hex | Role on redbelly.network | Where it was read |
|---|---|---|
| `#FFFFFF` | page background | body |
| `#000000` | body text (computed) | body |
| `#21272A` | link and nav text | global `a { color }` |
| `#FF4646` | primary button, red spans, TVL card | `.Button_button` background, 54 uses in CSS |
| `#FF7373` | button hover, secondary button border | `.Button_button:hover` |
| `#FF5050` | brand red (brand kit), `/ecosystem` title | brand page swatch; `h2` on `/ecosystem` |
| `#395060` | slate: dark sections, section titles, card copy | `.WhatWeOffer_offerSection`; 93 uses, the most-used non-neutral |
| `#283A46` | charcoal: brand kit main colour, "The Team" panel, Vine header | brand page; computed rgb(40, 58, 70) |
| `#263640` | footer | `.Footer_footer` |
| `#142530` | deep navy (brand kit secondary), Vine dark background | brand page; Vine `extra.css` |
| `#4C6B80` | muted headings, hero title, "Visit" links on `/ecosystem` | h4 eyebrows |
| `#848B91` | brand grey, Vine h1, "body text when necessary" | brand page |
| `#EFF3F6` | tinted section and panel background | `.TeamComponent_teamSection` |
| `#DFE7EC` | card border, blog tag chip, gradient end | `.BlogCard_blogCardContainer` border |
| `#F4F4F4` | neutral button | "Get in Touch", arrow buttons |
| `#EFEFEF` | header hairline | `.Header_header` border-bottom |
| `#FFDDDD` | button focus ring (3px) | `.Button_button:focus` |
| `#D9D9D9`, `#ECEBEC`, `#FA423C` | brand kit secondary colours | brand page |
| `#0A9F95` / `#0FC6B9` | teal tag text and border on `/ecosystem` cards | ecosystem page |
| `#0070AF`, `#00527F`, `#29B1FF` | Vine's action blue, hover, dark-mode link | Vine `extra.css` header comment: "Redbelly Blocks Design System" |

Gradients: the hero sits on a PNG with a soft pink-to-blue wash; roadmap cards fade white to
`#DFE7EC`. Shadows are few: `0 1px 1px rgba(0,0,0,.08)` on buttons, `0 1px 6px rgba(0,0,0,.29)` on
hover, `0 4px 24px rgba(0,0,0,.25)` on roadmap cards, a six-layer soft stack on ecosystem cards.

Two of their pairs fail AA for normal text: white on `#FF4646` and `#FF4646` on white are both
3.38:1. That's a real reason, not a taste one, to keep red out of our interactive colour.

### What we use

The structure is theirs: white page, slate and charcoal for depth, one warm accent. The accent hue
is the one deliberate shift. Ours is teal, not red and not Vine's blue.

Light theme:

| Token | Hex | Use | Origin |
|---|---|---|---|
| `bg` | `#FFFFFF` | page | theirs |
| `surface` | `#EFF3F6` | sidebar hover, panels, note callouts, table stripes | their tinted section |
| `surface-2` / `code-bg` | `#F4F4F4` | inline code, neutral buttons | their neutral button |
| `hairline` | `#DFE7EC` | card and table rules | their card border |
| `hairline-strong` | `#848B91` | form control borders (3.45:1 on white) | brand grey |
| `text` | `#283A46` | body | brand kit body rule |
| `text-strong` | `#21272A` | site name, strong | their link colour |
| `text-muted` | `#4C6B80` | captions, sidebar secondary, last-verified dates (5.64:1) | their eyebrows |
| `heading` | `#283A46` | headings | brand kit |
| `slate` | `#395060` | dark panels, the for-agents block border, secondary buttons | their sections |
| `accent` | `#0F766E` | links, primary buttons, active sidebar item, focus ring (5.47:1 on white) | ours |
| `accent-high` | `#115E59` | link hover, button hover | ours |
| `accent-low` | `#CCFBF1` | tip callouts, selected tab tint | ours |
| `code-block-bg` | `#142530` | code blocks, for-agents block | brand deep navy |
| `redbelly-ref` | `#FF5050` | reserved; see section 10 for the one permitted use | brand kit |

Dark theme, which is Starlight's default when no theme is stored:

| Token | Hex | Use |
|---|---|---|
| `bg` / `bg-nav` | `#142530` | page and nav (nav is never charcoal-filled, that's Vine's header) |
| `surface` | `#1C3140` | panels; the docs site's dark code background |
| `surface-2` / `code-bg` | `#283A46` | inline code |
| `hairline` | `#395060` | rules |
| `text` | `#DFE7EC` | body (12.55:1) |
| `text-muted` | `#BFCFD9` | captions (9.83:1) |
| `heading` | `#FFFFFF` | headings |
| `accent` | `#5EEAD4` | links, focus (10.62:1) |
| `accent-high` | `#99F6E4` | hover |
| `accent-low` | `#134E4A` | tints |
| `code-block-bg` | `#0C1A24` | code blocks |

Status and callout colours are in `tokens.css` under `--rb-color-testnet-*`, `mainnet-*`, `note-*`,
`tip-*`, `caution-*`, `danger-*`, `verified-*`, `stale-*`. Every text-on-background pair, in both
themes, is computed in `CONTRAST.md`; the lowest text pair is 4.91:1 (accent on surface, light) and
everything else is above 5:1. Caution is amber and danger is a dark red; neither is Redbelly red.

Starlight's grey scale is mapped so its own components pick up the palette without per-component
CSS. Note the inversion: in light mode Starlight calls the darkest text `--sl-color-white` and the
page `--sl-color-black`. The mapping (light): white `#21272A`, gray-1 `#283A46`, gray-2 `#395060`,
gray-3 `#4C6B80`, gray-4 `#848B91`, gray-5 `#BFCFD9`, gray-6 `#DFE7EC`, gray-7 `#EFF3F6`, black
`#FFFFFF`. Dark runs the other way from `#FFFFFF` down to black `#142530`.

## 4. Layout and spacing

### What Redbelly uses

A Bootstrap-shaped grid: `.container` at 540 / 900 / 1162px max-width with 15px side padding,
`.container-lg` 1247px, breakpoints as `max-width` queries at 767, 991 and 1199px (131, 34 and 39
rules respectively). Content sections are `padding: 100px 0` on desktop and `56px 0` on mobile, and
alternate white, `#EFF3F6` and slate `#395060` backgrounds. Card grids are flex with 33.33% columns
and 6px gutters (blog), or CSS grid with four 271px columns and 16px gap (ecosystem). Panel padding is
40px (light panel) and 52px (dark panel); cards 12px sides / 24px bottom (blog) or 20px (roadmap).

Header: 71px tall, static (it scrolls away), white, 1px `#EFEFEF` bottom border, 165px logo, six
nav items at 17px / 500 with hover-revealed dropdowns, one filled CTA on the right ("Join Mainnet",
174 x 34px). On mobile the header is 67px and the nav is a full-screen white overlay that fades in
over 300ms with list items sliding in from the right at 50ms stagger.

Footer: `#263640`, `padding: 64px 0`, a top row of social icons under three 12px uppercase labels,
then five link columns (Resources, Community, Company, General, Locations) with 12px / 600 uppercase
headings and 14px / 500 links, then a copyright line at 40% opacity and "Back to top".

Vine, for contrast, is a sticky 84px charcoal header with a boxed "VINE" mark, a left sidebar, a
1220px container and a charcoal footer carrying the REDBELLY wordmark.

### What we use

Starlight's two-column docs frame with these values: nav 72px (`--sl-nav-height: 4.5rem`), sidebar
280px, prose measure 720px (`--sl-content-width: 45rem`), and a wider `--rb-container` of 1162px for
the landing page and card grids so they match the marketing site's measure. Side padding 16px, 24px
from 50em. Vertical rhythm on a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Landing sections are
96px tall on desktop and 56px on mobile, alternating white and `surface` like theirs; we don't use a
full slate section on the landing page because a slate band with white title is the most
recognisable thing on their home page.

Breakpoints follow Starlight (50em and 72rem) rather than Bootstrap's; the site is docs first and the
grid is Starlight's.

Header: white (dark: page colour) with a hairline, never a filled charcoal bar. Left: the site name
as text. Centre: nothing; Starlight puts search there. Right: "Vine" and "GitHub" as plain links, the
theme toggle, and one filled button "Start" in accent. Below the header on every page, a 32px strip
in `surface` carries the independence line (section 10). The strip is part of the `Header` override
so it can't be forgotten on a page.

Footer: `surface` background in light, `surface` in dark, three columns (Build, Reference on Vine,
About this site), the independence line repeated in full, the last-verified date of the page, and
the licence line. No social icon row and no "Back to top" link.

Radii: 3px buttons, 6px chips, 10px cards, 16px panels, pill badges. Shadows: `sm` `0 1px 1px
rgba(0,0,0,.08)`, `md` `0 8px 10px rgba(0,0,0,.10)`, `lg` `0 4px 24px rgba(0,0,0,.18)` (their .25
toned down), `hover` `0 1px 6px rgba(0,0,0,.29)`. Cards use a hairline border and no shadow at rest,
`sm` on hover; only the prompt card grid uses `md`.

## 5. Components

Each entry says what it is, which Starlight piece it builds on, and the token values. Where the
marketing site has an equivalent, the sampled values are given first.

### Top nav

Starlight `Header` override. Height 72px, background `bg-nav`, bottom hairline. Site name at 18px /
700 `text-strong` (see section 10 for the treatment). Links 15px / 500 `text`, hover `accent`,
underline offset 4px on hover only. Primary button: accent background, white 14px / 600 label, 3px
radius, padding 8px 20px, min height 36px desktop and 44px mobile, hover `accent-high` plus `hover`
shadow, focus ring per section 7. Redbelly's own is 15px / 700 white on `#FF4646` with 6px 38px
padding and a 3px radius; we keep the radius and the shape and change the colour and weight. Mobile:
Starlight's drawer, not a full-screen overlay.

### Doc sidebar

Starlight `Sidebar` as is, with `--sl-sidebar-width: 17.5rem`, group labels 12px / 600 uppercase
`text-muted` (their footer heading style), items 14px / 500, active item `accent` text on
`accent-low` with a 3px radius, hover `surface`. Collapsible groups keep Starlight's chevrons.

### For-agents block

Required at the top of every content page (PLAN section 12.1). A `<Aside>`-shaped custom component,
not a Starlight aside: full-width, `code-block-bg` background, `agents-text` body, a 12px uppercase
label "FOR AGENTS" in `agents-label` teal, 4px left border in `slate`, radius 10px, padding 20px 24px.
Contents are imperative sentences in a `<ul>` and one `<pre>` with the facts in a fenced block so an
agent can copy it. It carries a "copy as markdown" button (same control as the code block) and an
`id="for-agents"` anchor. It renders identically in both themes because it's already dark; that's
deliberate, it should look like a terminal, not a callout.

### Prompt card and card grid

PLAN section 14. Card: `bg` background, 1px `hairline`, 10px radius, padding 20px (their blog card is
12px sides, 24px bottom, 10px radius, 1px `#DFE7EC` border; we widen the padding for text-heavy
cards). Fields in order: level pill and time (12px), title 18px / 600, one-line outcome 14px
`text-muted`, the prompt in a 14px mono block with its own copy button, "learn" line, footer row with
recipe chip and the last-verified badge. Hover: `sm` shadow and border `hairline-strong`, 250ms.
Grid: CSS grid `repeat(auto-fill, minmax(320px, 1fr))` with 16px gap inside `--rb-container` (their
ecosystem grid is four 271px columns at 16px gap; blog is three at 12px). Filters above the grid are
chips (see status pill) that toggle `aria-pressed`.

### Foundry / Hardhat tab switcher

Starlight's built-in `<Tabs>` with `syncKey="toolchain"` so a choice on one page holds on every
page. Tab labels 14px / 600, active tab `accent` with a 2px bottom border in `accent`, inactive
`text-muted`. Starlight persists synced tabs in `localStorage`; that's the only client JS the tabs
need and it ships with Starlight.

### Code block with copy button and filename

Starlight's Expressive Code, configured with `frames` on (filename tab and copy button come free),
`themes` set to a custom pair generated from the palette (`code-block-bg` background in both themes,
`code-block-text` foreground), 14px JetBrains Mono, line-height 1.6, 10px radius, no shadow. Copy
button: 32px square target on desktop, 44px on touch, `accent` icon on hover, "Copied" state for
1.5s. Inline code: `code-bg` background, 3px radius, 2px 5px padding, 0.9em.

### Last-verified badge

Pill, 12px / 600, `verified-text` on `verified-bg`, 4px 10px padding, a check glyph, text "Verified
12 Sep 2026 · Claude Code 2.1, Cursor 1.7". Older than 90 days flips to `stale-*` (amber) with the
text "Re-verify". Placed on every prompt card and in the page footer; rendered from frontmatter
(`lastVerified`, `verifiedWith`), never typed by hand.

### Status pill

Same pill shape. Variants: `testnet` (green), `mainnet` (dark red), `verified` (slate on `#DFE7EC`),
`stale` (amber), `draft` (`text-muted` on `surface`). Used inline in headings ("Deploy to testnet
[Testnet 153]") and as chips in the card grid filters. Never coloured Redbelly red; mainnet's red is
`#991B1B` on `#FEE2E2`, which is a warning colour, not a brand colour.

### Two-speed banner

Sits under the page title on any page whose steps differ by network. Two panes side by side (stack
under 50em), each with a status pill, a one-line rule and a link. Testnet pane: `testnet-bg`, left
border `#166534`, "Fast lane. Scaffold, deploy, try it with an ineligible wallet." Mainnet pane:
`mainnet-bg`, left border `#991B1B`, "Gated. Pre-flight and the ship report first." The copy is fixed
in the component; pages don't rewrite it, which keeps PLAN section 12.3's promise in one place.

### Step list for the golden path

Starlight's `<Steps>` component with numbered circles restyled: 28px circle, `accent` border 2px,
number 13px / 600 `accent`, connecting rule in `hairline`. Completed steps (set by the page, not by
state) fill the circle with `accent` and white. Each step's heading is 18px / 600; a step may hold a
code block and a two-speed note.

### Callout variants

Starlight `<Aside>` types mapped to our tokens: `note` (surface, slate border), `tip` (accent-low,
accent border), `caution` (amber), `danger` (dark red). All: 4px left border, 10px radius, 16px 20px
padding, 15px body, title 14px / 600 uppercase. Add one custom variant, `vine`, for "this fact lives
on Vine": `surface` background, no coloured border, a 12px label "ON VINE" and the outbound link as
the last line. It's the visible form of the never-overlay-Vine rule.

### Buttons and links

Primary: accent fill, white text, 3px radius, 14px / 600, 8px 20px, hover `accent-high` and `hover`
shadow. Secondary: transparent, 1px `slate` border, `slate` text, hover `surface`. Their secondary is
transparent with a 1px `#FF7373` border and `#FF4646` text; same shape, our colours. Text links:
`accent`, no underline at rest in nav and cards, underline in body prose (their prose has none, but a
docs site needs it), hover `accent-high`. Transition 150ms colour only.

## 6. Motion rules

What they do: `a` and every button transition `all .4s ease-in-out`; arrow buttons `.45s
cubic-bezier(0,0,.2,1)`; roadmap cards `opacity, transform, box-shadow .6s cubic-bezier(.4,0,.2,1)`
driven by GSAP pinning; the mobile menu fades over 300ms with items sliding in from the right; the
partner logo strip is a Slick carousel on an infinite `scroll` keyframe; `html { scroll-behavior:
smooth }`. Six keyframes total. No `prefers-reduced-motion` rule anywhere in 345 KB of CSS.

Ours:

Durations 150ms (colour, opacity), 250ms (transform, shadow, border), 400ms (drawer open and close,
the only place their 400ms survives). Easings `cubic-bezier(0.4, 0, 0.2, 1)` for state changes and
`cubic-bezier(0, 0, 0.2, 1)` for things entering. Transition named properties only, never `all`.
Nothing animates on scroll, nothing pins, nothing auto-plays, nothing loops. Hover lifts are shadow
and border changes, not translateY. `scroll-behavior: smooth` is on but wrapped in the reduced-motion
query. Under `prefers-reduced-motion: reduce` the duration tokens go to 0ms, which turns every
transition into an instant change with no extra selectors.

## 7. Accessibility rules

Focus: their links show the browser default (`outline: auto 1px`) and their buttons a 3px pink
box-shadow ring. Ours is one rule for everything focusable: `outline: 2px solid var(--rb-color-focus);
outline-offset: 2px`, `:focus-visible` only, and it's 5.47:1 against white and 10.62:1 against dark
(computed in `CONTRAST.md`). Inside code blocks and the for-agents block the ring uses
`agents-label` so it's visible on navy.

Targets: every control is at least 44 x 44px on touch (`--rb-target-min`), which means nav links,
copy buttons, tab labels, chips and sidebar items get padding on mobile that they don't need on
desktop. Their 34px "Join Mainnet" button and 36px dropdown rows would fail this.

Keyboard: Starlight's skip link stays first in the DOM. Tabs use arrow keys (built in). Card grids
are lists of links, one link per card, with the whole card clickable through a pseudo-element, not a
nested link. The for-agents copy button and code copy buttons are real `<button>`s with
`aria-label`. Dropdowns don't exist; the nav is flat.

Contrast: every pair in section 3 passes AA; most pass AAA. Muted text is never below 5:1. Status
pills carry a text label, never colour alone. Reduced motion as in section 6. Colour scheme
follows the system unless the user picks one, with Starlight's `ThemeSelect`.

Headings: one h1 per page, no skipped levels, the for-agents block uses a `<p>` label rather than a
heading so it doesn't sit above the h1 in the outline.

## 8. Performance budget

Per page, gzipped: HTML under 40 KB, CSS under 30 KB (Starlight's own plus `tokens.css` plus
components), fonts 72 KB total (two variable latin subsets, `font-display: swap`, both preloaded on
the landing page, only the sans preloaded on doc pages), images as AVIF or WebP with width and height
attributes, no image above 120 KB. Client JavaScript: only what Starlight ships for search (Pagefind,
loaded on interaction), the theme toggle, synced tabs and the copy buttons. No analytics script, no
chat widget, no carousel, no scroll library. Nothing from a third-party origin at runtime; Google
Fonts is not used because self-hosting is smaller and doesn't leak visits. For comparison, the
marketing home page is a 6.9 MB HTML document before images.

Font subsetting: latin only (`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`,
which is Google's latin range). No Arabic, no extended ranges, no HEXP axis; use `pyftsubset` or
`glyphhanger` and record the resulting sizes in the site README.

## 9. Starlight customisation approach

Starlight 0.42.0 on Astro 7.3.2 (npm, 12 September 2026). Three layers, in order of preference:

CSS custom properties first. Starlight documents that any unlayered custom CSS overrides its own
styles, and lists every property in `packages/starlight/src/style/props.css`. `tokens.css` sets the
ones we need: `--sl-font`, `--sl-font-mono`, the `--sl-text-*` scale, `--sl-line-height*`,
`--sl-nav-height`, `--sl-sidebar-width`, `--sl-content-width`, `--sl-color-*` (the grey ramp, accent
trio, text, bg, bg-nav, bg-sidebar, bg-inline-code, bg-accent, hairline trio) and `--sl-shadow-*`,
with dark values on `:root` and light values under `:root[data-theme='light']`, which is how
`props.css` itself is structured. Load it through `customCss` in `astro.config.mjs`. Expressive Code
themes are configured separately in the `expressiveCode` option.

Component overrides second, through the `components` option (Starlight's "Overriding Components"
guide and the overrides reference). We need four: `Header` (site name treatment, flat links, the
independence strip), `Footer` (our three columns and lines instead of edit link and pagination
alone), `PageTitle` (status pill next to the title and the last-verified badge under it), and
`SiteTitle` (text wordmark, no logo image). Everything else stays default. Overrides are written to
reuse Starlight's own pieces where they exist (`@astrojs/starlight/components/...`) so upgrades don't
break them.

Custom components third, as `.astro` files used from MDX: `ForAgents`, `PromptCard`, `CardGrid`
(Starlight has a `CardGrid`; ours is a thin wrapper that sets the 1162px container and the filter
chips), `TwoSpeed`, `StatusPill`, `LastVerified`, and the `vine` aside variant as a wrapper around
Starlight's `<Aside>`. Starlight's `<Tabs>`, `<Steps>`, `<Aside>`, `<Badge>` and `<LinkButton>` are
used directly.

No custom theme package and no Tailwind. Cascade layers are left alone; our CSS is unlayered so it
wins by default. Dark mode uses Starlight's `data-theme` attribute and `ThemeSelect`; we don't add a
second mechanism.

## 10. What we must not reuse, and how we stay recognisably separate

Not ours to use, in any form: the Redbelly logo (the hexagonal isotype and the "REDBELLY" wordmark
with its red "RED"), the brand kit files, their copy, the hero image and the isometric illustrations,
the partner logo strip, the "Join Mainnet" and "Explore Redbelly" calls to action, the footer's
company address and social links, the phrase "Redbelly Network" as a site title, and any page that
could pass as `/blog`, `/ecosystem` or Vine's home. The brand kit page states the palette and
typography rules for their identity; taking the fonts and a related palette for a site about
building on the network is normal practice for a community docs site, but using the marks is not,
and using red as our interactive colour would make the two sites blur.

Concrete differentiators, all of which are in this system rather than left to taste:

The site name is set as text only, "Redbelly Development Tool", 18px / 700 in `text-strong`, no
mark, no red letters, followed by a 12px `verified`-style pill reading "community". Under it, in
the header strip and again in the footer, the fixed line: "An independent builder site for Redbelly
Network. Not affiliated with or endorsed by Redbelly Network Pty Ltd. Network facts link to Vine."
It renders on every page because it's in the `Header` override, and it's the first thing a
screen reader hears after the skip link.

The accent shift: teal `#0F766E` / `#5EEAD4` for every interactive element. Redbelly's red and
Vine's blue are never used for links, buttons, focus or active states. The only permitted use of
`#FF5050` is a 12px inline dot next to outbound links to `*.redbelly.network`, so the reader can see
which links leave our site; it's reserved in `tokens.css` as `redbelly-ref` and nothing else may use
it.

Structural tells: our header is white with a hairline, never a filled charcoal bar (Vine) and never
carries a logo image (both); our landing page has no slate band with white title, no partner logo
strip, no roadmap; our code font is neither theirs nor Vine's; the for-agents block, the two-speed
banner and the last-verified badge exist on no Redbelly property and appear on every page of ours.

## 11. What wasn't accessible or wasn't done

Chromium could not complete a TLS handshake through the session proxy, so requests were routed
through Node; rendering is unaffected but `:hover` and `:focus` samples were taken by script rather
than by hand. The roadmap section on the home page is scroll-pinned and shows blank in the flattened
screenshot. Weglot, HubSpot and analytics were blocked deliberately. The brand manual PDF and the
font "Download Pack" on `/brand` were not downloaded; the licences were checked upstream instead.
`docs.redbelly.network` has a one-screen home, so its inner page styles come from its `extra.css`
rather than a rendered sample. No Redbelly Discord, dashboards or gated pages were visited.
