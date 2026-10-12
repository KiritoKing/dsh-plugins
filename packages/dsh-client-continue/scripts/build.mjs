/** Emit the host ESM entry and DSH's browser module factory. */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
mkdirSync('lib', { recursive: true })
await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', format: 'esm', platform: 'node', target: 'node24', bundle: true })
await build({
  entryPoints: ['src/client/index.ts'], outfile: 'lib/client.js', format: 'cjs', platform: 'browser', target: 'es2022', bundle: true,
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: { js: 'window.__ModuleLoader__.load({ id: "@chlrc/dsh-client-continue", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
