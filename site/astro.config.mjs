// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { rbTheme } from './ec-theme.mjs';

// Starlight renders markdown tables as scrollable blocks; a scrollable region needs to be
// reachable from the keyboard (axe scrollable-region-focusable), so every table gets tabindex=0.
function rehypeFocusableTables() {
  /** @param {any} node */
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'table') node.properties = { ...node.properties, tabindex: 0 };
    for (const child of node.children ?? []) walk(child);
  };
  return (/** @type {any} */ tree) => walk(tree);
}

// Vine, Routescan and GitHub have no way back to this site, and a reader usually follows one of
// their links in the middle of a task. So a link that leaves the site opens in a new tab, says so
// to a screen reader, and gets an arrow from site.css. Done at build, so it works with scripts
// off and costs no JavaScript. Components use src/components/Ext.astro for the same rule.
function rehypeExternalLinks() {
  const isExternal = (/** @type {unknown} */ href) => typeof href === 'string' && /^https?:\/\//.test(href);
  const note = { type: 'element', tagName: 'span', properties: { className: ['sr-only'] }, children: [{ type: 'text', value: ' (opens in a new tab)' }] };
  /** @param {any} node */
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'a' && isExternal(node.properties?.href) && !node.properties.target) {
      node.properties = { ...node.properties, target: '_blank', rel: ['noopener'] };
      node.children = [...(node.children ?? []), structuredClone(note)];
    }
    // A link written as JSX inside an .mdx page arrives as an MDX node, not an element.
    if ((node.type === 'mdxJsxTextElement' || node.type === 'mdxJsxFlowElement') && node.name === 'a') {
      const attrs = node.attributes ?? [];
      const href = attrs.find((/** @type {any} */ a) => a.name === 'href')?.value;
      if (isExternal(href) && !attrs.some((/** @type {any} */ a) => a.name === 'target')) {
        node.attributes = [...attrs, { type: 'mdxJsxAttribute', name: 'target', value: '_blank' }, { type: 'mdxJsxAttribute', name: 'rel', value: 'noopener' }];
        node.children = [...(node.children ?? []), structuredClone(note)];
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  return (/** @type {any} */ tree) => walk(tree);
}

const REPO = 'https://github.com/gatedpath/builder-path/tree/main';

export default defineConfig({
  // No domain yet. `site` is set when the owner picks one; until then canonical URLs and the
  // sitemap are off, which changes nothing else.
  trailingSlash: 'always',
  build: { inlineStylesheets: 'always' },
  markdown: { rehypePlugins: [rehypeFocusableTables, rehypeExternalLinks] },
  integrations: [
    starlight({
      title: 'Redbelly Development Tool',
      description:
        'An independent builder site for Redbelly Network (chain 151 mainnet, 153 testnet): from idea to a deployed, identity-gated, checked dApp, for people and for people directing an AI coding agent.',
      customCss: ['./design/tokens.css', './src/styles/fonts.css', './src/styles/site.css'],
      components: {
        Header: './src/components/overrides/Header.astro',
        Footer: './src/components/overrides/Footer.astro',
        PageTitle: './src/components/overrides/PageTitle.astro',
        SiteTitle: './src/components/overrides/SiteTitle.astro',
      },
      social: [{ icon: 'github', label: 'Source on GitHub', href: REPO }],
      lastUpdated: false,
      credits: false,
      pagefind: true,
      head: [
        { tag: 'link', attrs: { rel: 'preload', href: '/fonts/readex-pro-latin-wght.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' } },
      ],
      sidebar: [
        { label: 'Start here', link: '/start/' },
        {
          label: 'Concepts',
          items: [
            { label: 'Overview', link: '/concepts/' },
            { label: 'Consensus and finality', link: '/concepts/consensus-and-finality/' },
            { label: 'Blocks on demand', link: '/concepts/blocks-on-demand/' },
            { label: 'Gas model', link: '/concepts/gas-model/' },
            { label: 'Identity gate', link: '/concepts/identity-gate/' },
          ],
        },
        { label: 'Identity', link: '/identity/' },
        {
          label: 'Directing an agent',
          items: [
            { label: 'Bring your own agent', link: '/agents/' },
            { label: 'Say what you want', link: '/agents-guide/say-what-you-want/' },
            { label: 'Read what comes back', link: '/agents-guide/read-what-comes-back/' },
            { label: 'What never goes into an agent', link: '/agents-guide/what-never-goes-in/' },
          ],
        },
        {
          label: 'Writing Solidity',
          items: [
            { label: 'The path', link: '/solidity/' },
            { label: '1. Gate a function', link: '/solidity/gate-a-function/' },
            { label: '2. Test all five states', link: '/solidity/test-five-states/' },
            { label: '3. Read the gated token', link: '/solidity/the-gated-token/' },
            { label: '4. Deploy, and be refused', link: '/solidity/deploy-and-refusals/' },
            { label: '5. Safe and timelock', link: '/solidity/admin-safe-and-timelock/' },
            { label: '6. Price it in dollars', link: '/solidity/gas-in-dollars/' },
          ],
        },
        { label: 'Projects', link: '/tutorials/' },
        { label: 'Tools', link: '/tools/' },
        { label: 'Research', link: '/research/' },
        { label: 'Review before mainnet', link: '/review/' },
        { label: 'When something fails', link: '/errors/' },
        { label: 'Operate', link: '/operate/' },
        { label: 'Status', link: '/status/' },
      ],
      expressiveCode: {
        themes: [rbTheme],
        useStarlightDarkModeSwitch: false,
        useStarlightUiThemeColors: false,
        defaultProps: { wrap: false, preserveIndent: true },
        styleOverrides: {
          borderRadius: '10px',
          borderWidth: '0px',
          codeFontFamily: 'var(--sl-font-mono)',
          codeFontSize: 'var(--sl-text-code)',
          codeLineHeight: '1.6',
          codePaddingBlock: '1rem',
          codePaddingInline: '1.25rem',
          codeBackground: 'var(--rb-color-code-block-bg)',
          uiFontFamily: 'var(--sl-font)',
          uiFontSize: 'var(--sl-text-xs)',
          focusBorder: '#5EEAD4',
          frames: {
            shadowColor: 'transparent',
            frameBoxShadowCssValue: 'none',
            editorBackground: 'var(--rb-color-code-block-bg)',
            editorTabBarBackground: 'var(--rb-color-code-block-bg)',
            editorActiveTabBackground: 'var(--rb-color-code-block-bg)',
            editorActiveTabForeground: '#EFF3F6',
            editorTabBarBorderBottomColor: '#395060',
            editorActiveTabIndicatorTopColor: '#5EEAD4',
            editorActiveTabIndicatorBottomColor: 'transparent',
            editorActiveTabIndicatorHeight: '2px',
            editorTabBorderRadius: '0px',
            terminalBackground: 'var(--rb-color-code-block-bg)',
            terminalTitlebarBackground: 'var(--rb-color-code-block-bg)',
            terminalTitlebarForeground: '#EFF3F6',
            terminalTitlebarBorderBottomColor: '#395060',
            terminalTitlebarDotsForeground: '#395060',
            terminalTitlebarDotsOpacity: '1',
            inlineButtonBackground: '#283A46',
            inlineButtonForeground: '#EFF3F6',
            inlineButtonBorder: '#395060',
            inlineButtonBorderOpacity: '1',
            inlineButtonBackgroundIdleOpacity: '1',
            inlineButtonBackgroundHoverOrFocusOpacity: '1',
            tooltipSuccessBackground: '#0F766E',
            tooltipSuccessForeground: '#FFFFFF',
          },
        },
      },
    }),
  ],
});
