#!/usr/bin/env node
/** Public-release gate: package scripts own compilation and tests; this script owns audit and archive inspection. */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const baselineSha = '639ed015397290b3745d163aafe02ffee4aa3f84'
const packages = [
  { name: '@chlrc/dsh-context-rollover', dir: join(root, 'packages/dsh-context-rollover') },
  { name: '@chlrc/dsh-client-continue', dir: join(root, 'packages/dsh-client-continue') },
]
const args = process.argv.slice(2)
const modes = new Set(['--scan', '--typecheck', '--test', '--build', '--audit', '--pack'])
const release = args[0] === '--release'
if (args[0] === '--help') {
  console.log('Usage: node scripts/check-public.mjs [--scan|--typecheck|--test|--build|--audit|--pack|--release PACKAGE VERSION]')
  process.exit(0)
}
if (release ? args.length !== 3 : args.length > 1 || (args.length === 1 && !modes.has(args[0]))) {
  throw new Error('Unsupported arguments; use --help')
}
const full = args.length === 0 || release
const selected = (mode) => full || args[0] === mode
const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? join(root, '.cache/npm') }

/** Spawn without a shell; a nonzero child exit fails the gate. */
function run(command, argv, cwd = root, capture = false) {
  console.log(`> ${command} ${argv.join(' ')} [${relative(root, cwd) || '.'}]`)
  const result = spawnSync(command, argv, {
    cwd, env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || '')
    throw new Error(`${command} failed with ${result.status ?? result.signal}`)
  }
  return result.stdout
}

/** Reject known private addresses, credentials, and machine-specific paths without echoing their contents. */
function inspectText(text, label) {
  const rules = [
    ['private address', /\b(?:[a-z0-9-]+\.)*(?:byted\.org|bytedance\.(?:com|net)|byteintl\.(?:com|net))\b/i],
    ['machine path', /(?:\/Users\/[^\s"'<>]+|\/home\/[^\s"'<>]+|[A-Za-z]:\\Users\\[^\s"'<>]+)/],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['access token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/],
    ['registry authentication', /(?:_authToken|_password|_auth)\s*[=:]\s*(?!\$\{)[^\s]+/i],
  ]
  for (const [kind, pattern] of rules) {
    if (pattern.test(text)) throw new Error(`${label}: possible ${kind}; review before publication`)
  }
}

const ignoredDirs = new Set(['.git', 'node_modules', '.cache', '.pnpm-store', '.artifacts', 'lib', 'dist', 'coverage'])
const generated = new Set(['tsconfig.dsh-paths.json', 'tsconfig.build-paths.json', 'tsconfig.compat-paths.json', 'tsconfig.generated.json'])
/** Scan source files, not generated local resolution files or dependency trees. Archive contents are checked separately. */
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name) || generated.has(entry.name) || /\.(?:tgz|tsbuildinfo)$/.test(entry.name)) continue
    const path = join(dir, entry.name)
    const label = relative(root, path)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error(`${label}: source symlinks require explicit review`)
    if (stat.isDirectory()) scan(path)
    else if (stat.isFile()) {
      if (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example') throw new Error(`${label}: environment file in public tree`)
      const data = readFileSync(path)
      if (!data.includes(0)) inspectText(data.toString('utf8'), label)
    }
  }
}

/** Resolve only the external public baseline and pass an absolute path to every package child. */
function prepareEnvironment() {
  const requested = env.DSH_CHECKOUT_DIR ?? resolve(root, '../.cache/dsh-public-rc2')
  if (!isAbsolute(requested)) throw new Error('DSH_CHECKOUT_DIR must be absolute')
  const checkout = realpathSync(requested)
  if (checkout === root || !relative(root, checkout).startsWith(`..${sep}`)) {
    throw new Error('The DSH compatibility checkout must be outside this repository')
  }
  const sha = run('git', ['rev-parse', 'HEAD'], checkout, true).trim()
  if (sha !== baselineSha) throw new Error(`Compatibility checkout must be at ${baselineSha}`)
  // Tracked modifications would invalidate the exact-revision compatibility claim.
  run('git', ['diff', '--quiet', 'HEAD', '--'], checkout)
  const manifest = JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8'))
  if (manifest.version !== '0.2.0-rc.2') throw new Error('Unexpected DSH baseline version')
  env.DSH_CHECKOUT_DIR = checkout
}

/** Require package-owned gates and public metadata before dispatching any build or test. */
function manifests() {
  for (const pkg of packages) {
    const manifest = JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8'))
    if (manifest.name !== pkg.name || manifest.private || manifest.license !== 'MIT') throw new Error(`${pkg.name}: invalid public package metadata`)
    if (manifest.publishConfig?.access !== 'public') throw new Error(`${pkg.name}: publishConfig.access must be public`)
    const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
    if (repository !== 'git+https://github.com/KiritoKing/dsh-plugins.git' && repository !== 'https://github.com/KiritoKing/dsh-plugins') {
      throw new Error(`${pkg.name}: repository must point to the public repository`)
    }
    for (const task of ['typecheck', 'test', 'build']) {
      if (typeof manifest.scripts?.[task] !== 'string') throw new Error(`${pkg.name}: missing ${task} script`)
    }
    if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error(`${pkg.name}: explicit package files allowlist required`)
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const version of Object.values(manifest[field] ?? {})) {
        if (/^(?:file:|link:|workspace:)/.test(version)) throw new Error(`${pkg.name}: nonpublic ${field} reference`)
      }
    }
    pkg.manifest = manifest
  }
}

/** Produce an archive after building, then inspect names and every text member from the archive itself. */
function pack(pkg) {
  const destination = join(root, '.artifacts')
  mkdirSync(destination, { recursive: true })
  const report = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], pkg.dir, true))
  if (!Array.isArray(report) || report.length !== 1) throw new Error(`${pkg.name}: unexpected npm pack result`)
  const item = report[0]
  if (item.name !== pkg.name || item.version !== pkg.manifest.version || basename(item.filename) !== item.filename) {
    throw new Error(`${pkg.name}: unexpected packed metadata`)
  }
  const archive = join(destination, item.filename)
  if (!existsSync(archive)) throw new Error(`${pkg.name}: archive missing`)
  const entries = run('tar', ['-tzf', archive], root, true).trim().split('\n')
  const files = new Set()
  for (const entry of entries) {
    if (!entry.startsWith('package/') || entry.includes('\\') || entry.split('/').includes('..')) throw new Error(`${pkg.name}: unsafe archive member`)
    if (entry.endsWith('/')) continue
    const path = entry.slice('package/'.length)
    if (/(?:^|\/)(?:node_modules|\.git|\.github|tests?|compat|\.env[^/]*)(?:\/|$)/.test(path) || /(?:tsconfig.*\.json|\.tsbuildinfo|\.tgz)$/.test(path)) {
      throw new Error(`${pkg.name}: unexpected development/private archive member ${path}`)
    }
    // npm pack must not include a symbolic link to a machine-specific target.
    const source = join(pkg.dir, path)
    if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error(`${pkg.name}: archive member is not a regular package file: ${path}`)
    const contents = run('tar', ['-xOzf', archive, entry], root, true)
    inspectText(contents, `${pkg.name} archive ${path}`)
    files.add(path)
  }
  for (const required of ['package.json', 'README.md', 'LICENSE', pkg.manifest.main, pkg.manifest.types]) {
    if (typeof required !== 'string' || !files.has(required.replace(/^\.\//, ''))) throw new Error(`${pkg.name}: required archive entry missing: ${required}`)
  }
  const packedManifest = JSON.parse(run('tar', ['-xOzf', archive, 'package/package.json'], root, true))
  if (packedManifest.name !== pkg.name || packedManifest.version !== pkg.manifest.version || packedManifest.publishConfig?.access !== 'public') {
    throw new Error(`${pkg.name}: packed manifest changed public identity`)
  }
  console.log(`Inspected ${pkg.name}@${item.version}: ${files.size} files, ${item.integrity}`)
  return relative(root, archive).split(sep).join('/')
}

if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node.js 24')
if (selected('--scan')) scan(root)
if (full) run('pnpm', ['run', 'lint'])
if (selected('--test')) run('pnpm', ['run', 'test:release'])
if (selected('--audit')) run('pnpm', ['audit', '--prod', '--audit-level=low'])
const packageWork = ['--typecheck', '--test', '--build', '--pack'].some(selected)
if (packageWork) {
  prepareEnvironment()
  manifests()
}
if (release) {
  const pkg = packages.find((candidate) => candidate.name === args[1])
  const version = args[2]
  if (!pkg || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version) || pkg.manifest.version !== version) {
    throw new Error('Release package/version must match an allowed package manifest; this gate never bumps versions')
  }
}
for (const mode of ['typecheck', 'test', 'build']) {
  if (selected(`--${mode}`) || (mode === 'build' && selected('--pack'))) {
    for (const pkg of packages) run('pnpm', ['run', mode], pkg.dir)
  }
}
if (selected('--pack')) {
  for (const pkg of packages) {
    const tarball = pack(pkg)
    if (release && pkg.name === args[1] && env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `tarball=${tarball}\n`)
    }
  }
}
console.log('Requested public gate completed. This does not audit Git history or authorize publication.')
