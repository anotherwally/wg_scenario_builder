// Draws the battlefield map as inline SVG from the "diagram" data on a
// deployment-zone option, plus any "markers" from the victory conditions.
// Coordinates are in inches on the table (default 72 x 48).

import { esc } from './text.js';

const MAX_NAME = 16;

function shortName(name) {
  const n = String(name ?? '').trim();
  return n.length > MAX_NAME ? `${n.slice(0, MAX_NAME - 1)}…` : n;
}

function shapeSvg(s) {
  const cls = `zone zone-${esc(s.side ?? 'none')}`;
  if (s.type === 'rect') {
    return `<rect class="${cls}" x="${+s.x}" y="${+s.y}" width="${+s.w}" height="${+s.h}"/>`;
  }
  if (s.type === 'circle') {
    return `<circle class="${cls}" cx="${+s.cx}" cy="${+s.cy}" r="${+s.r}"/>`;
  }
  if (s.type === 'polygon' && Array.isArray(s.points)) {
    const pts = s.points.map(([x, y]) => `${+x},${+y}`).join(' ');
    return `<polygon class="${cls}" points="${pts}"/>`;
  }
  return '';
}

function shapeCentre(s) {
  if (Array.isArray(s.labelAt)) return s.labelAt;
  if (s.type === 'rect') return [s.x + s.w / 2, s.y + s.h / 2];
  if (s.type === 'circle') return [s.cx, s.cy];
  if (s.type === 'polygon' && s.points?.length) {
    const sum = s.points.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
    return [sum[0] / s.points.length, sum[1] / s.points.length];
  }
  return null;
}

function dimSvg(d) {
  const { x1, y1, x2, y2 } = d;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Short ticks at both ends, perpendicular to the line.
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * 1;
  const ny = ((x2 - x1) / len) * 1;
  const tick = (x, y) => `<line class="dim" x1="${x - nx}" y1="${y - ny}" x2="${x + nx}" y2="${y + ny}"/>`;
  return `<line class="dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${tick(x1, y1)}${tick(x2, y2)}`
    + `<text class="dimlabel" x="${mx}" y="${my}">${esc(d.label)}</text>`;
}

export function renderMap({ table, diagram, markers = [], names = [], emptyText = '' }) {
  const W = table?.width ?? 72;
  const H = table?.height ?? 48;
  const pad = 2;
  const parts = [`<rect class="tbl" x="0" y="0" width="${W}" height="${H}" rx="1"/>`];

  for (let x = 12; x < W; x += 12) parts.push(`<line class="grid" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
  for (let y = 12; y < H; y += 12) parts.push(`<line class="grid" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);

  const shapes = diagram?.shapes ?? [];
  // Player zones first, then "none" areas (exclusions) drawn over them.
  const ordered = [...shapes.filter((s) => s.side !== 'none'), ...shapes.filter((s) => s.side === 'none')];
  for (const s of ordered) parts.push(shapeSvg(s));

  // Dashed reference lines, e.g. the table middle line.
  for (const l of diagram?.lines ?? []) {
    parts.push(`<line class="midline" x1="${+l.x1}" y1="${+l.y1}" x2="${+l.x2}" y2="${+l.y2}"/>`);
    if (l.label) parts.push(`<text class="midlabel" x="${+l.x1 + 1}" y="${+l.y1 - 1}">${esc(l.label)}</text>`);
  }

  // "No deployment within N inches" rings around markers (e.g. Top Secret).
  for (const m of markers) {
    if (m.ring) parts.push(`<circle class="ring" cx="${+m.x}" cy="${+m.y}" r="${+m.ring}"/>`);
  }

  for (const d of diagram?.dims ?? []) parts.push(dimSvg(d));

  for (const s of ordered) {
    const label = s.label ?? (s.side === 'a' ? names[0] : s.side === 'b' ? names[1] : '');
    const c = shapeCentre(s);
    if (label && c) parts.push(`<text class="zlabel" x="${c[0]}" y="${c[1]}">${esc(shortName(label))}</text>`);
  }

  for (const m of markers) {
    parts.push(`<g class="marker"><circle cx="${+m.x}" cy="${+m.y}" r="1.8"/>`
      + `<text x="${+m.x}" y="${+m.y + 5}">${esc(m.label ?? '')}</text></g>`);
  }

  if (!diagram && emptyText) {
    parts.push(`<text class="zlabel muted" x="${W / 2}" y="${H / 2}">${esc(emptyText)}</text>`);
  }

  const aria = diagram
    ? `Table map: ${names[0] ?? 'Player 1'} and ${names[1] ?? 'Player 2'} deployment zones`
    : 'Empty table map';
  const caption = `${table?.label ?? ''}${table?.label ? ' · ' : ''}each square is 12"`;

  return `<figure class="map-fig">
    <svg viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" role="img" aria-label="${esc(aria)}">${parts.join('')}</svg>
    <figcaption>${esc(caption)}</figcaption>
  </figure>`;
}
