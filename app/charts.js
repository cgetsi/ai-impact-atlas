import { escapeHtml } from './utils.js';

/**
 * Simple vertical column chart (HTML, responsive, linear scale from zero).
 * Bar heights are exact percentages of one fixed plot box (the same box any reference
 * line is positioned in); value labels sit above each bar and never resize it.
 *
 * columns: [{ label, value, display, sub?, title? }]
 * tone: 'up' (last bar highlighted) | 'down' | 'neutral' | 'compare' (first muted, rest highlighted)
 */
export function columnChart({ columns, max, refValue = null, refLabel = '', tone = 'up', ariaLabel }) {
  const top = max || Math.max(...columns.map((c) => c.value));
  const refPct = refValue != null ? (refValue / top) * 100 : null;
  const cols = columns
    .map((c, i) => {
      const h = Math.min(100, Math.max(0, (c.value / top) * 100));
      const isLast = i === columns.length - 1;
      let cls = 'sc-col-bar';
      if (refValue != null) cls += c.value >= refValue ? ' above' : ' below';
      else if (tone === 'down') cls += isLast ? ' win' : i === 0 ? ' start' : ' mid';
      else if (tone === 'neutral') cls += ' mid solid';
      else if (tone === 'compare') cls += i === 0 ? ' start' : ' win';
      else cls += isLast ? ' win' : ' mid';
      return `
        <div class="sc-col">
          <div class="${cls}" style="height:${h.toFixed(2)}%" title="${escapeHtml(c.title || '')}"></div>
          <span class="sc-col-val ${isLast ? 'last' : ''}" style="bottom:calc(${h.toFixed(2)}% + 4px)">${escapeHtml(c.display)}</span>
        </div>`;
    })
    .join('');
  const axis = columns
    .map(
      (c) => `
        <div class="sc-col-axis">
          <span class="sc-col-lbl">${escapeHtml(c.label)}</span>
          ${c.sub ? `<span class="sc-col-sub">${escapeHtml(c.sub)}</span>` : ''}
        </div>`
    )
    .join('');
  return `
    <div class="sc-cols" role="img" aria-label="${escapeHtml(ariaLabel)}">
      <div class="sc-cols-plot">
        <div class="sc-cols-inner">
          ${cols}
          ${refPct != null ? `<div class="sc-ref-line" style="bottom:${refPct.toFixed(2)}%"><span>${escapeHtml(refLabel)}</span></div>` : ''}
        </div>
      </div>
      <div class="sc-cols-axis">${axis}</div>
    </div>
  `;
}
