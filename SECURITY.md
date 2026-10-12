# Security policy

## Supported versions

Security fixes target the latest published version of each `@chlrc` package. Host compatibility is verified against the specific public DeepSeek Harness revision documented in [README.md](README.md); compatibility with another revision is not implied.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/KiritoKing/dsh-plugins/security/advisories/new) when available. If it is not enabled, open a public issue asking for a private reporting channel without disclosing exploit details, credentials, logs, or session data. A response time is not guaranteed.

## Maintainer safeguards

- Never commit credentials, private service addresses, personal filesystem paths, or private session fixtures.
- Review all files and reachable Git history before making the repository public. The automated public-file scan is a conservative safeguard, not a complete secret detector or history audit.
- Run the root check, production dependency audit, and package archive inspection before a release.
- Keep GitHub Actions pinned to reviewed commit SHAs and dependency resolution in the committed workspace lockfile.
- Publish through npm Trusted Publishing with GitHub OIDC; do not add a long-lived npm token to repository secrets.
- Require review for releases through the `npm` GitHub environment and restrict release dispatch to the default branch.

Plugins execute in the host's process and can access capabilities granted to that host. Install only trusted packages and review configuration before enabling them.
