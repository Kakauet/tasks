/**
 * Some hosts rewrite the HTML after deployment. Netlify inserts a comment
 * (and the whitespace around it) inside <head>, so React's hydration no longer
 * matches the server HTML: in a background tab the board then stays on its
 * skeleton until the first click. This runs while <head> is parsed, before
 * React hydrates, and removes those foreign nodes. Netlify's floating badge
 * is hidden from globals.css instead: on the free tier it ignores its own
 * "Hide this badge" preference.
 */
const script = `(() => {
  try {
    Array.from(document.head.childNodes).forEach(node => {
      if (node.nodeType === 8 || (node.nodeType === 3 && !node.textContent.trim())) node.remove();
    });
  } catch {}
})();`

export function HostingCleanupScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
