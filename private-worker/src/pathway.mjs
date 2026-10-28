export const PATHWAY_ROOT = '/private/tools/pathway/';
export const PATHWAY_FILES = Object.freeze([
  'index.html', 'style.css', 'theme.css', 'theme.js', 'app.mjs',
  'access-state.mjs', 'profile-visibility.mjs', 'calculations.mjs',
  'clearance.mjs', 'design.mjs', 'export.mjs', 'legacy-section.mjs',
  'material-reference.mjs', 'section.mjs', 'solver.mjs', 'steel.mjs',
  'view.mjs', 'worker.mjs',
]);

const assetPaths = new Set(PATHWAY_FILES.map(file => PATHWAY_ROOT + file));

export function isPathwayPath(pathname) {
  return pathname === PATHWAY_ROOT.slice(0, -1) || pathname === PATHWAY_ROOT || assetPaths.has(pathname);
}

// Dynamic section previews use inline styles. Executable code and module
// workers stay same-origin; only the existing Google font hosts are external.
export const PATHWAY_CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function withPathwayLink(links, origin) {
  const destination = new URL(PATHWAY_ROOT, origin).href;
  const equivalent = new Set([destination, destination.slice(0, -1), destination + 'index.html']);
  if (links.some(link => equivalent.has(link.url))) return links;
  return [...links, {
    title: 'Pathway Designer',
    url: destination,
    description: 'Design and inspect a smooth pathway for a PVC profile.',
  }];
}
