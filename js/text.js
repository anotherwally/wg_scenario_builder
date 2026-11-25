// Small text helpers. All rule text from the JSON files is escaped before it
// reaches the page, so the data files can't inject HTML.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

// Inline formatting: **bold**.
function inline(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Render a rule's "full" text. It accepts a string or an array of lines:
 *   "## Heading"   -> sub-heading
 *   "- item"       -> bullet (consecutive bullets form one list)
 *   anything else  -> paragraph
 */
export function richText(lines) {
  const list = Array.isArray(lines) ? lines : [lines];
  let html = '';
  let inList = false;

  for (const raw of list) {
    const line = String(raw ?? '');
    if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.slice(2))}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line.startsWith('## ')) html += `<h4>${inline(line.slice(3))}</h4>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
