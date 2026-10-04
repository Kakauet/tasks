/**
 * Some hosts rewrite the HTML after deployment. Netlify inserts a comment
 * (and the whitespace around it) inside <head>, so React's hydration no longer
 * matches the server HTML: in a background tab the board then stays on its
 * skeleton until the first click. This runs while <head> is parsed, before
 * React hydrates, and removes those foreign nodes. It also uses the badge's
 * own "Hide this badge" preference so Netlify does not overlay the app.
 */
const script = `(() => {
  try {
    Array.from(document.head.childNodes).forEach(node => {
      if (node.nodeType === 8 || (node.nodeType === 3 && !node.textContent.trim())) node.remove();
    });
  } catch {}
  try { localStorage.setItem("nl-hud:public:v1", "hidden"); } catch {}
})();`

export function HostingCleanupScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
