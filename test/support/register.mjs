// Lets the component tests build real components in Node (see assets.mjs).
// In Node, troika-three-text loads as CommonJS and requires three that way,
// hence the THREE_CJS_DEPRECATED warning `npm test` turns off. The browser
// build uses the ES modules.
import { register } from 'node:module';
register('./assets.mjs', import.meta.url);

// Stand-ins for the few browser objects the components touch while being
// built: troika-three-text's glyph canvas, font requests and icon images.
// Nothing draws in these tests (text never lays out, icons never load); only
// the interaction logic runs. `any` answers every property and call with
// itself, and reads as 0 where a number is needed.
const any = new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any,
  apply: () => any,
  construct: () => any,
  set: () => true,
});
globalThis.self ??= globalThis;
globalThis.document ??= { createElement: () => any };
globalThis.Image ??= any;
globalThis.XMLHttpRequest ??= any;
