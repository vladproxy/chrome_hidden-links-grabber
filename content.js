/**
 * Scans the current page for links hidden via position:absolute/fixed
 * with CSS offsets that place them (or an ancestor) outside the viewport.
 *
 * Detection strategy:
 *   1. getBoundingClientRect() is the ground truth — if a link's rect is
 *      entirely outside the viewport, it is hidden.
 *   2. We then walk up the DOM to find the element whose CSS offset exceeds
 *      `threshold` px, skipping zero or near-zero offsets that didn't cause
 *      the hiding (e.g. left:0px on a child inside an already-hidden parent).
 *   3. `threshold` (default 50) is the minimum absolute offset required to
 *      consider a CSS rule as intentionally hiding content.
 */
function findHiddenLinks(threshold = 50) {
  const vw = window.innerWidth  || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;

  /** True when the rect lies completely outside the viewport in any direction. */
  function isOffViewport(rect) {
    return (
      rect.right  <= 0  ||   // entirely to the left
      rect.bottom <= 0  ||   // entirely above
      rect.left   >= vw ||   // entirely to the right
      rect.top    >= vh      // entirely below
    );
  }

  /**
   * Which direction is the element hidden in?
   * Used to pick the most relevant CSS property for the reason string.
   */
  function hiddenDirection(rect) {
    if (rect.right  <= 0)  return 'left';
    if (rect.bottom <= 0)  return 'top';
    if (rect.left   >= vw) return 'right';
    if (rect.top    >= vh) return 'bottom';
    return null;
  }

  /**
   * Returns the subset of left/top/right/bottom offsets on `el` that exceed
   * the threshold (negative direction) or are absurdly large (positive direction).
   * Only considers elements with position:absolute or position:fixed.
   * Returns null if no qualifying offsets are found.
   */
  function getPositionData(el) {
    const style = window.getComputedStyle(el);
    const pos   = style.position;
    if (pos !== 'absolute' && pos !== 'fixed') return null;

    const raw = {
      left:   style.left,
      top:    style.top,
      right:  style.right,
      bottom: style.bottom,
    };

    const offending = {};
    for (const [key, val] of Object.entries(raw)) {
      if (val === 'auto') continue;
      const px = parseFloat(val);
      if (isNaN(px)) continue;
      // Negative offset beyond threshold: left:-51px with threshold=50 → flagged
      // Positive offset so large it pushes element off the opposite edge
      if (px < -threshold || px > Math.max(vw, vh) * 10) {
        offending[key] = val;
      }
    }

    if (Object.keys(offending).length === 0) return null;
    return { pos, offsets: offending };
  }

  /**
   * Builds a human-readable reason string, preferring the offset in `dir`.
   */
  function buildReason(posData, dir) {
    const { pos, offsets } = posData;
    if (dir && offsets[dir]) return `position:${pos}; ${dir}:${offsets[dir]}`;
    // Fallback: first offending offset
    const [k, v] = Object.entries(offsets)[0];
    return `position:${pos}; ${k}:${v}`;
  }

  /**
   * Walks from `link` up to <html> to find the element whose CSS offset
   * rule (beyond threshold) is responsible for the hiding.
   * Returns { posData, source } or null if none found.
   */
  function findResponsibleAncestor(link) {
    const selfData = getPositionData(link);
    if (selfData) return { posData: selfData, source: 'self' };

    let node = link.parentElement;
    while (node && node !== document.documentElement) {
      const data = getPositionData(node);
      if (data) {
        const tag = node.tagName.toLowerCase();
        const id  = node.id ? `#${node.id}` : '';
        const cls = node.className && typeof node.className === 'string'
          ? node.className.trim().split(/\s+/).map(c => `.${c}`).join('').slice(0, 30)
          : '';
        return { posData: data, source: `ancestor <${tag}${id}${cls}>` };
      }
      node = node.parentElement;
    }
    return null;
  }

  const seen    = new Set();
  const results = [];

  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.href;
    if (!href || href === location.href + '#' || /^javascript:/i.test(href)) return;

    // Skip elements with no rendered box (display:none etc.)
    if (link.getClientRects().length === 0) return;

    const rect = link.getBoundingClientRect();
    if (!isOffViewport(rect)) return;

    const hiding = findResponsibleAncestor(link);
    if (!hiding) return;

    const dir    = hiddenDirection(rect);
    const reason = buildReason(hiding.posData, dir);
    const key    = href + '|' + reason;
    if (seen.has(key)) return;
    seen.add(key);

    results.push({
      href,
      text:   (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120) || '(no text)',
      reason,
      source: hiding.source,
      rel:    link.rel    || '',
      target: link.target || '',
    });
  });

  return results;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'scan') {
    sendResponse({ links: findHiddenLinks(msg.threshold ?? 50) });
  }
  return true;
});
