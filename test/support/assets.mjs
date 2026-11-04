// Node loader for the component tests: files the browser build imports as
// assets load the way Vite gives them (fonts and images as their URL, `?raw`
// as the file's text), so components can be built and driven without a
// browser.
import { readFile } from 'node:fs/promises';
const ASSET = /\.(woff2?|ttf|png|jpe?g|hdr|exr|ktx2|svg)$/;
export async function load(url, context, next) {
  const u = new URL(url);
  if (u.search === '?raw') return { format: 'module', source: `export default ${JSON.stringify(await readFile(u.pathname, 'utf8'))};`, shortCircuit: true };
  if (ASSET.test(u.pathname)) return { format: 'module', source: `export default ${JSON.stringify(url)};`, shortCircuit: true };
  return next(url, context);
}
