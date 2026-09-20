export { assertTemplateReady, TemplateNotReady } from '../src/generate.mjs';
import { renderRedbellySol } from '../src/render-sol.mjs';
import { loadSibling } from '../src/siblings.mjs';

export async function renderRedbellySolSmoke() {
  return renderRedbellySol(await loadSibling('chains'));
}
