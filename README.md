# Personal DeepSeek Harness plugins

Personal MIT-licensed plugins maintained in [KiritoKing/dsh-plugins](https://github.com/KiritoKing/dsh-plugins), published under the public npm scope `@chlrc`. These are not official DeepSeek packages.

| Package | Purpose | Documentation |
| --- | --- | --- |
| `@chlrc/dsh-context-rollover` | Model-driven context-window rollover with durable notes and targeted history recovery | [README](packages/dsh-context-rollover/README.md) |
| `@chlrc/dsh-client-continue` | Client-side continue controls | [README](packages/dsh-client-continue/README.md) |

See each package's documentation for installation and configuration. A package being present in this source repository does not mean it has been published to npm. See [ATTRIBUTION.md](ATTRIBUTION.md) for rollover's upstream source, contribution history, and retained MIT notice.

## Compatibility baseline

The exact public compatibility target is [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) tag `dsh-v0.2.0-rc.2`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`. DSH APIs are pre-stable; passing against this revision does not promise compatibility with other versions. The host source checkout stays outside this repository and outside published package archives.

Use Node.js 24, pnpm 11.7.0, and npm 11.5.1 or newer. The workspace installs shared TypeScript 6.0.3, Vitest 4.1.8, Node.js 24 types, esbuild 0.25+, and React 19 tooling. Package manifests own their runtime peer dependencies.

## Development

From the repository root, create the external public checkout if it is not already available:

```sh
mkdir -p ../.cache
git clone --branch dsh-v0.2.0-rc.2 --single-branch https://github.com/deepseek-ai/deepseek-harness.git ../.cache/dsh-public-rc2
git -C ../.cache/dsh-public-rc2 rev-parse HEAD
export DSH_CHECKOUT_DIR="$(realpath ../.cache/dsh-public-rc2)"
```

Verify the printed commit is exactly the baseline above. `DSH_CHECKOUT_DIR` must be absolute and point outside the plugin repository. The root dispatcher passes this same controlled value to every package command, independent of its working directory; no installed application checkout is used as a fallback.

Prepare the baseline's generated remote files and declarations, not its full test suite:

```sh
pnpm --dir "$DSH_CHECKOUT_DIR" install --frozen-lockfile --ignore-scripts
pnpm --dir "$DSH_CHECKOUT_DIR" run build:lib:host
pnpm --dir "$DSH_CHECKOUT_DIR" exec tsc -b tsconfig.client.json
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
```

The workspace lockfile must be generated and reviewed when dependency declarations change, then committed for reproducible frozen installs. Lifecycle scripts are disabled during CI installation. If an esbuild binary needs explicit local installation, review it before running `pnpm rebuild esbuild`; the workspace permits only that reviewed dependency installer.

The root check scans public source files, runs ESLint over the source tree, dispatches both packages' `typecheck`, `test`, and `build` scripts, runs `pnpm audit --prod --audit-level=low`, creates npm archives with lifecycle scripts disabled, and inspects archive members and their text content. It requires the expected public names, MIT licensing, public repository metadata, explicit package file lists, and public npm access. It validates the DSH commit and rejects tracked modifications to that baseline. Individual entry points are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:public`, `pnpm check:public`, and `pnpm pack:inspect` (which builds first).

Generated path configurations, build outputs, installed dependencies, and local archives are ignored by the source scan; archives are checked separately. This gate does not audit Git history, detect every possible secret, or test the host's full suite. Host-supplied peer dependencies are not installed into the plugin workspace merely to satisfy peer resolution and are outside its production dependency audit. Review all public files, archives, and reachable history before public release. Running the gate, not this documentation, supplies validation evidence.

## CI

[Public compatibility](.github/workflows/ci.yml) uses isolated sibling plugin and host checkouts, prepares only host libraries/client declarations, then runs the root gate. Checkout, setup-node, and pnpm setup actions are pinned to commit SHAs. Pull-request CI has read-only repository permissions and no publishing permission.

## Automatic npm publishing

[Publish npm package](.github/workflows/publish.yml) runs automatically for independent package version tags: `dsh-context-rollover-v<VERSION>` or `dsh-client-continue-v<VERSION>`. A read-only preparation job rejects unknown packages, invalid versions, a version that differs from its committed manifest, or a revision outside the default branch's history. Only then does the publishing job request OIDC, run the full gate for both packages, and publish the selected inspected archive with public access and npm provenance. Stable versions use `latest`; prereleases use `next`. Published versions cannot be overwritten; a duplicate tag/manual request fails rather than skipping or silently changing dist-tags.

After merging a reviewed version change into `main`, create and push only the chosen package tag, for example:

```sh
git tag dsh-client-continue-v0.1.1 <reviewed-main-commit>
git push origin refs/tags/dsh-client-continue-v0.1.1
```

The version above is illustrative: it must already match that commit's package manifest and must not exist on npm. No ordinary branch push publishes packages. Manual `workflow_dispatch` remains available on the default branch with package and exact-version inputs. The workflow never bumps versions, creates tags, or pushes commits. Each package has a separate publishing concurrency group. Release installs do not restore dependency caches.

### One-time account setup

Repository automation is not npm authorization. Before automatic publishing works:

1. Confirm npm ownership or publishing rights for `@chlrc`. If a package does not exist yet, perform its first-publication bootstrap with an owner-authorized interactive npm login/2FA session using the archive inspected by `pnpm check`. Never put the credential in GitHub secrets or commit it.
2. For **each** package, add a GitHub Actions Trusted Publisher in npm package settings: organization/user **`KiritoKing`**, repository **`dsh-plugins`**, workflow filename **`publish.yml`**, environment **`npm`**. Enable **Allow npm publish** (stage-only permission is insufficient for this workflow). Match all fields exactly.
3. Configure the GitHub `npm` environment to allow the `main` branch plus tags matching `dsh-context-rollover-v*` and `dsh-client-continue-v*`, with no other deployment refs. Required reviewers can be added if owner approval is desired; they pause otherwise automatic publishing. Protect the default branch and release tags according to maintainer access needs.
4. Publish a fresh reviewed version through the workflow and verify its npm registry metadata and provenance. New npm Trusted Publisher configurations may expire unless their first successful publish happens within two days; follow the current npm settings. After OIDC works, restrict traditional token publishing access and revoke obsolete automation tokens as appropriate.

npm Trusted Publishing requires a supported GitHub-hosted runner and npm CLI 11.5.1 or newer. This workflow uses `ubuntu-latest`, Node.js 24, npm 11.5.1, the `npm` environment and job-scoped `id-token: write`. No long-lived npm secret is configured. See [npm's Trusted Publishing documentation](https://docs.npmjs.com/trusted-publishers/) for current account setup and bootstrap requirements. These files do not themselves create npm packages, package authorization, or remote environment protection rules.

## Security and licensing

See [SECURITY.md](SECURITY.md), the root [MIT license](LICENSE), and [ATTRIBUTION.md](ATTRIBUTION.md). Rollover retains its upstream package license in addition to repository-level notices.
