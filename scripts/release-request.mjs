/** Resolve only allowlisted release tags or a default-branch manual request. */
import assert from 'node:assert/strict'

const packages = ['dsh-context-rollover', 'dsh-client-continue']
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*))*)?$/

/** @returns The package, exact version and npm distribution tag to publish. */
export function resolveReleaseRequest({ eventName, ref, defaultBranch, inputs = {}, manifests }) {
  let packageName
  let version
  if (eventName === 'push') {
    const directory = packages.find((name) => ref.startsWith(`refs/tags/${name}-v`))
    assert.ok(directory, 'Unsupported release tag')
    packageName = `@chlrc/${directory}`
    version = ref.slice(`refs/tags/${directory}-v`.length)
  } else {
    assert.equal(eventName, 'workflow_dispatch', 'Unsupported release event')
    assert.equal(ref, `refs/heads/${defaultBranch}`, 'Manual releases require the default branch')
    packageName = inputs.package
    version = inputs.version
  }
  assert.ok(packages.some((name) => packageName === `@chlrc/${name}`), 'Unsupported release package')
  assert.equal(typeof version, 'string', 'Release version is required')
  assert.match(version, versionPattern, 'Release version must be canonical SemVer without build metadata')
  assert.equal(manifests[packageName]?.name, packageName, 'Package manifest identity mismatch')
  assert.equal(manifests[packageName]?.version, version, 'Release version must match the committed manifest')
  return { package: packageName, version, distTag: version.includes('-') ? 'next' : 'latest' }
}
