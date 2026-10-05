# kit

**Your Claude Code toolbox, at a glance.** See every skill, plugin and MCP server you have installed: what is active in this chat, what it costs in context, and turn it on or off with one press.

[Türkçe](README.tr.md)

You install skills, plugins and MCP servers one at a time, and before long you lose track of what is loaded, what is eating your context window and what you never use. kit is a Claude Code mod that keeps the whole list in one pane. It also has a small App Store, so you can find new extensions on GitHub and see exactly what an install will run before anything runs.

## What you get

- **One pane for everything you installed.** Plugins, personal skills and MCP servers, each shown as a round avatar of its GitHub owner.
- **Context cost you can see.** The tokens each item takes up in this chat, and the total as a share of your context window.
- **One-press on/off.** Turn a skill, plugin or MCP server off without losing it, and turn it back on later exactly as it was.
- **Usage tracking.** kit counts how often Claude really uses each item, and points out the ones that cost tokens but have sat idle for 14+ days.
- **Updates.** A badge shows when a plugin's marketplace has a newer version, and you can update with one press.
- **Discover and install from GitHub.** Top Charts and search work like a small App Store. Each install shows its plan and safety warnings first.
- **A dock above the prompt.** It shows what is active at a glance without opening anything.

## Install

```sh
claude plugin marketplace add effectustasi/kit
claude plugin install kit@kit
```

Then run `/reload-plugins` (or start a new session) and type `/kit`.

**Requirements**

- A Claude Code build that supports mods (function-hook plugins). kit was built and tested on 2.1.286.
- The [GitHub CLI](https://cli.github.com/) (`gh`), signed in. It is only needed for search, install, descriptions and update checks.
- `curl`, used to fetch owner avatars. It ships with Windows 10+, macOS and most Linux distributions.

## User guide

### The pane: `/kit`

`/kit` opens the **Kit** pane. The top line reads like `12.4k tokens in context · 1% of 1.0M`: what your installed items cost in this chat, out of your context window. Press **Refresh** (or `r`) to scan again.

Each installed item gets a round avatar, and the ring around it tells you its state:

| Ring | Meaning |
| --- | --- |
| Colorful story ring | **Active**: loaded in this chat and costing tokens right now |
| Thin gray ring | **On**: installed and enabled, but not loaded in this chat |
| No ring, faded | **Off**: switched off by kit |

Hover an avatar to see what the item does and how often it has been used. Built-in app servers and claude.ai connectors can't be switched by kit, so they are folded into one line under the grid.

### The detail card

Press an item's name to open its card. The card shows:

- the item's kind, source repo, state and token cost
- a description, taken from `plugin.json`, the `SKILL.md` frontmatter or the GitHub repo description
- usage, for example `Used 12× · last yesterday`
- an orange hint when the item is on, costs tokens and hasn't been used for 14+ days

It also has these buttons:

- **Turn Off / Turn On**:
  - Plugins use `claude plugin disable/enable`.
  - Skills are moved between `~/.claude/skills` and `~/.claude/kit-off/skills`.
  - User-scope MCP servers have their exact definition parked in `~/.claude/kit-off/mcp.json`, and turning them back on restores that definition unchanged.
- **Remove…** asks first. A plugin goes through Claude Code's own `claude plugin uninstall`. A skill folder or MCP definition is moved to `~/.claude/kit-off/removed/`, never deleted, so a mistake can be undone by hand.
- **Update** appears when the plugin's marketplace publishes a newer version than the one you have. It refreshes the marketplace, then runs `claude plugin update`.

After any change, run `/reload-plugins` to apply it. MCP server changes take effect in a new session.

### Discover and install

The search box under the grid takes two kinds of input:

- **A word** (`blender`, `postgres`, `notes`) searches GitHub for Claude Code skills, plugins and MCP servers, ranked by stars.
- **`owner/repo` or a github.com link** goes straight to the install check.

With the search box empty, **Top Charts** lists the most-starred installable extensions. It skips `awesome-*` lists, which are lists of extensions, not something you can install.

Pressing **Get** never installs anything by itself. kit inspects the repo and shows a card with:

- what kind of extension it is and what it will install
- **the exact commands it will run**, in order
- warnings worth a second look: the repo is **archived**, has **no commits for over a year**, or has **no license**

Only **Install** runs those commands. kit recognizes four kinds of repo:

| The repo has | kit runs |
| --- | --- |
| `.claude-plugin/marketplace.json` | `claude plugin marketplace add` + `claude plugin install` |
| A folder with a `SKILL.md` | a shallow `git clone`, then copies each skill folder into `~/.claude/skills` |
| An MCP server published to npm | `claude mcp add … -- npx -y <package>` |
| A Python MCP server (`pyproject.toml`) | `claude mcp add … -- uvx --from git+https://github.com/<repo> <script>` |

### The dock

A small handle, `◖ kit · 3 active`, sits above the prompt. Point at it to reveal your installed items' icons, and point at an icon to see its name, status, cost and description. **Open** jumps to the full pane.

### Text summary

`/kit` also returns a short text summary for the transcript, for example:

```
Kit: 12.4k tok always-on of 1.0M.
Plugins 2/2 on: ponytail 906, ...
Skills 2/2 on: agent-reach 312, graphify 122
MCP servers 4/5 on: serena 3.1k, context7, inventor (off) | +6 app/connector servers 2.0k
```

## Where kit keeps its data

Everything stays on your machine:

| Path | What |
| --- | --- |
| `~/.claude/kit-off/skills/` | skills you turned off |
| `~/.claude/kit-off/mcp.json` | MCP server definitions you turned off |
| `~/.claude/kit-off/removed/` | removed skills and MCP definitions (undo by moving them back) |
| `~/.claude/kit-off/sources.json` | which GitHub repo each item came from |
| `~/.claude/kit-off/avatars/` | cached owner avatars and repo covers |
| Claude Code plugin store (`~/.claude/plugins/store/`) | usage counts |

## Privacy

kit has no server and sends no telemetry. Usage counts are stored locally. The only network calls it makes:

- GitHub through your own `gh` CLI, for search, repo details, descriptions and update checks
- `curl`, to fetch GitHub avatars and repo covers
- the npm registry, to check whether an MCP package is published

## Platform notes

kit is developed on Windows. Some features currently rely on Windows tools:

- Turn on/off and Remove for **skills** move folders with `cmd /c move` on Windows and `mv` elsewhere.
- Skill installs copy with `xcopy` on Windows and `cp -R` elsewhere.
- **Repo cover images** on the install card are resized with PowerShell's `System.Drawing`, so on macOS and Linux the card simply has no cover.

Testing and fixes on macOS and Linux are very welcome. See Contributing.

## Contributing

Issues and pull requests are welcome. The whole mod is one file, [`hooks/register.tsx`](hooks/register.tsx), with its types in [`types/index.d.ts`](types/index.d.ts).

```sh
claude plugin validate .   # checks the manifest and the hooks the way the engine will
claude plugin test .       # runs tests/kit.test.tsx on desktop and terminal surfaces
```

To develop against a live session, load your checkout with `claude --plugin-dir <path-to-kit>`.

## License

[MIT](LICENSE) © effectustasi
