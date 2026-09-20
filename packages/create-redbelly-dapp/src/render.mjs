// The smallest template language that does the job: `__NAME__` placeholders and
// `{{#if key}} ... {{/if}}` / `{{#unless key}} ... {{/unless}}` blocks. Applied to text
// files only; everything else is copied byte for byte.

const TEXT_EXTENSIONS = new Set([
  '.md', '.json', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.toml', '.yml', '.yaml', '.sol', '.txt',
  '.env', '.example', '.mdc', '.css', '.html', '.gitignore', '.npmrc', '.gas-snapshot', '.editorconfig',
]);

export function isTextFile(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base.startsWith('.') && !base.slice(1).includes('.')) return true; // dotfiles like .gitignore
  const dot = base.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(base.slice(dot));
}

// Matches a block whose body holds no other block opener, so nested blocks resolve inside out.
const INNER_BLOCK_RE = /\{\{#(if|unless) ([a-zA-Z0-9_]+)\}\}\n?((?:(?!\{\{#(?:if|unless) )[\s\S])*?)\{\{\/\1\}\}\n?/g;

export function renderText(text, vars) {
  let out = text;
  let previous;
  do {
    previous = out;
    out = out.replace(INNER_BLOCK_RE, (_m, kind, key, body) => {
      if (!(key in vars)) throw new Error(`template refers to unknown variable ${key}`);
      const truthy = Boolean(vars[key]);
      return (kind === 'if') === truthy ? body : '';
    });
  } while (out !== previous);
  if (/\{\{[#/](?:if|unless)/.test(out)) throw new Error('unbalanced {{#if}}/{{#unless}} block in template');
  out = out.replace(/__([A-Z][A-Z0-9_]*)__/g, (m, key) => {
    if (key in vars) return String(vars[key]);
    return m; // leave things like __dirname-style names alone
  });
  return out;
}

/** Files whose names npm would drop or that need a different name on disk. */
export function outputName(rel) {
  return rel
    .replace(/(^|\/)_gitignore$/, '$1.gitignore')
    .replace(/(^|\/)_npmrc$/, '$1.npmrc')
    .replace(/(^|\/)_gitattributes$/, '$1.gitattributes')
    .replace(/(^|\/)_env\.example$/, '$1.env.example');
}
