// A recording's replay data, as a file of its own: /casts/<id>.js.
//
// The page a visitor loads carries none of it. The player adds this file to the page when Play is
// pressed, so only a reader who asks for a replay pays for one (the owner's point, 21 September
// 2026: limits for a phone, full access at a desk, without guessing the device). It is an ordinary
// script that hands its data to the player, not JSON to fetch, because the offline copy is opened
// from a folder and a browser refuses to fetch from one; a script tag it allows.
import type { APIRoute } from 'astro';
import { casts } from '../../../casts.config.mjs';
import { loadCast } from '../../lib/cast-data.js';

export function getStaticPaths() {
  return casts.map((c) => ({ params: { id: c.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const { output, gap } = loadCast(String(params.id));
  const data = JSON.stringify({ gap, events: output.map((e) => [e[0], e[2]]) });
  const body = `window.__rbCast&&window.__rbCast(${JSON.stringify(params.id)},${data});\n`;
  return new Response(body, { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
};
