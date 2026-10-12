/** Resolve development declarations from the pinned public DSH checkout. */
import { readFileSync, writeFileSync, globSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (!process.env.DSH_CHECKOUT_DIR) throw new Error('Set DSH_CHECKOUT_DIR to the built public DSH checkout')
const checkout = resolve(process.env.DSH_CHECKOUT_DIR)
const paths = {}
for (const file of globSync('{packages/*/*,vendor/*}/package.json', { cwd: checkout })) {
  const manifest = JSON.parse(readFileSync(resolve(checkout, file), 'utf8'))
  if (!manifest.name || !manifest.exports) continue
  const directory = dirname(resolve(checkout, file))
  for (const [key, value] of Object.entries(manifest.exports)) {
    const types = typeof value === 'object' && value !== null ? value.types : undefined
    if (typeof types !== 'string' || !existsSync(resolve(directory, types))) continue
    paths[manifest.name + (key === '.' ? '' : key.slice(1))] = [resolve(directory, types)]
  }
}
const config = {
  compilerOptions: { target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
    jsx: 'react-jsx', skipLibCheck: true, rewriteRelativeImportExtensions: true, declaration: true, declarationMap: false, outDir: 'lib/types',
    rootDir: 'src', paths, types: ['node', 'react'], lib: ['ES2024', 'DOM', 'DOM.Iterable'] },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
}
writeFileSync(resolve(root, 'tsconfig.generated.json'), JSON.stringify(config, null, 2) + '\n')
