# GitHub Copilot coding agent environment setup

This repository now ships a `copilot-setup-steps` workflow so Copilot starts with the right tools and dependencies. The workflow runs before every Copilot session in the repository's ephemeral GitHub Actions runner. It follows the guidance from [Customizing the development environment for GitHub Copilot coding agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment).

## Quick start

- File: `.github/workflows/copilot-setup-steps.yml`
- Job name must remain `copilot-setup-steps` (required by GitHub).
- Triggers: manual `workflow_dispatch` plus validation on PRs/pushes that touch the workflow.
- Default runner: `ubuntu-22.04` with 30-minute timeout (change `runs-on` if you need larger or self-hosted runners).

## What the setup workflow does for SpectraPRO

- Checks out the repository with Git LFS enabled.
- Installs Node.js 20 and caches dependencies for both `platform/backend` and `platform/frontend`.
- Installs backend dependencies with `npm ci --ignore-scripts` (matches the Docker image to skip heavy Playwright postinstall scripts; remove the flag if you need browser binaries in the setup step).
- Installs frontend dependencies with `npm ci`.
- Installs Python 3.11 and pip dependencies from `requirements.txt`.

You can extend the steps with project-specific tasks such as `npm run prisma:generate`, seeding fixtures, or installing extra CLI tools (for example, Nuclei) if Copilot needs them for tests.

## Runner choices

- Standard GitHub-hosted: keep `runs-on: ubuntu-22.04`.
- Larger GitHub-hosted: set `runs-on` to a larger runner label (for example `ubuntu-4-core`). Ensure the larger runner pool is configured in your org.
- Self-hosted (Linux or Windows only): set `runs-on` to your runner label/scale set. Disable or customize the Copilot firewall in repo settings if your runner is on a private network. Make sure the runner can reach required Copilot hosts and any package registries you use.
- Windows: point `runs-on` at your Windows runner label. macOS runners are not supported by Copilot coding agent.

## Environment variables and secrets for Copilot

Add sensitive values as **environment secrets** in the `copilot` environment, and non-sensitive values as **environment variables**:

- `DATABASE_URL` for the platform PostgreSQL connection (Prisma).
- `JWT_SECRET` for backend auth tests.
- `OLLAMA_BASE_URL` if Copilot needs to hit a running Ollama instance.
- `NUCLEI_PATH` if you cache a Nuclei binary on self-hosted runners.
- `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` when routing traffic through a proxy.
- `PLAYWRIGHT_BROWSERS_PATH` if you preinstall browser binaries on self-hosted runners.

## Git LFS and repository assets

The workflow already checks out with `lfs: true`. If you do not need LFS objects, you can set `lfs: false` to speed up setup; otherwise leave it enabled to ensure reports, screenshots, or other large assets are available to Copilot.

## Validating the setup

- Run the workflow manually from the **Actions** tab to confirm it completes before invoking Copilot.
- Adjust steps if Copilot needs additional tooling or if you move to larger/self-hosted runners.
- Keep `timeout-minutes` at or below 59 per GitHub's requirements.
