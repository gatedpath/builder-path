// One Expressive Code theme for both colour schemes. The block background is dark navy in
// both themes (tokens: --rb-color-code-block-bg) so the frame reads like a terminal against a
// white page and against the dark page alike; only the shade differs, and that comes from the
// CSS variable, not from a second theme. Token colours are the palette's own light values on
// navy; every one is above 7:1 on #142530 (see site/design/CONTRAST.md for the method).
import { ExpressiveCodeTheme } from 'astro-expressive-code';

export const rbTheme = new ExpressiveCodeTheme({
  name: 'gatedpath',
  type: 'dark',
  colors: {
    'editor.background': '#142530',
    'editor.foreground': '#EFF3F6',
    'editorLineNumber.foreground': '#848B91',
    'editor.selectionBackground': '#395060',
    'editor.lineHighlightBackground': '#1C3140',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#9DB2BF', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.operator.new', 'keyword.operator.expression'], settings: { foreground: '#99F6E4' } },
    { scope: ['string', 'string.quoted', 'punctuation.definition.string', 'string.template'], settings: { foreground: '#FDE68A' } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character', 'constant.other'], settings: { foreground: '#BFCFD9' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function'], settings: { foreground: '#FFFFFF' } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.other.inherited-class', 'entity.name.type.contract', 'entity.name.type.interface'], settings: { foreground: '#5EEAD4' } },
    { scope: ['variable', 'variable.other', 'variable.parameter', 'meta.definition.variable'], settings: { foreground: '#EFF3F6' } },
    { scope: ['variable.other.property', 'support.variable.property', 'meta.object-literal.key', 'support.type.property-name', 'entity.name.tag'], settings: { foreground: '#DFE7EC' } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: '#BFCFD9' } },
    { scope: ['entity.other.attribute-name', 'keyword.other.unit'], settings: { foreground: '#FDE68A' } },
    { scope: ['keyword.key.toml', 'support.type.property-name.toml', 'entity.name.tag.toml'], settings: { foreground: '#5EEAD4' } },
    { scope: ['entity.name.section', 'entity.name.section.toml', 'entity.name.section.group-title.toml'], settings: { foreground: '#99F6E4' } },
    { scope: ['markup.heading', 'markup.heading entity.name', 'heading.1.markdown', 'heading.2.markdown'], settings: { foreground: '#5EEAD4', fontStyle: 'bold' } },
    { scope: ['punctuation.definition.heading.markdown'], settings: { foreground: '#5EEAD4' } },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.underline.link', 'string.other.link', 'markup.underline.link.markdown'], settings: { foreground: '#99F6E4' } },
    { scope: ['string.other.link.title.markdown', 'string.other.link.description.markdown'], settings: { foreground: '#FFFFFF' } },
    { scope: ['markup.inline.raw', 'markup.fenced_code', 'markup.raw'], settings: { foreground: '#FDE68A' } },
    { scope: ['markup.quote', 'punctuation.definition.quote.begin.markdown'], settings: { foreground: '#BFCFD9', fontStyle: 'italic' } },
    { scope: ['punctuation.definition.list.begin.markdown'], settings: { foreground: '#5EEAD4' } },
    { scope: ['invalid'], settings: { foreground: '#FECACA' } },
  ],
});
