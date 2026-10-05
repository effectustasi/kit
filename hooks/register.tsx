import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Hit, Inventory, Kind, Plan, Row, Usage } from '../types'

const PANE = 'kit'
const empty: Inventory = { rows: [], tokens: 0, window: 0 }
const inventory = atom({ plugin: 'kit', key: 'inventory' } as const, empty)
const busy = atom({ plugin: 'kit', key: 'busy' } as const, '')
const changed = atom({ plugin: 'kit', key: 'changed' } as const, false)
const plan = atom({ plugin: 'kit', key: 'plan' } as const, null as Plan | null)
const selected = atom({ plugin: 'kit', key: 'selected' } as const, '')
const hits = atom({ plugin: 'kit', key: 'hits' } as const, null as Hit[] | null)
const query = atom({ plugin: 'kit', key: 'query' } as const, '')
const top = atom({ plugin: 'kit', key: 'top' } as const, null as Hit[] | null)
const removing = atom({ plugin: 'kit', key: 'removing' } as const, '')
const usageSince = atom({ plugin: 'kit', key: 'usageSince' } as const, 0)

// ---------- Usage: count what Claude actually uses, across sessions ----------

const DAY = 86_400_000
const IDLE_DAYS = 14

// Which installed item a tool call belongs to: `mcp:<server>` for MCP tools, `skill:<name>` or
// `plugin:<name>` for the Skill tool (a plugin's skills are spelled `plugin:skill`).
function usageKey(e: any): string | undefined {
  const tool = String(e.tool ?? '')
  const m = tool.match(/^mcp__(.+?)__/)
  if (m) return `mcp:${m[1]}`
  if (tool === 'Skill' && typeof e.skill === 'string') {
    const [first, rest] = e.skill.split(':')
    return rest ? `plugin:${first}` : `skill:${first}`
  }
  return undefined
}

async function recordUse($: any, key: string) {
  const now = await $.clock.now()
  const usage = ((await $.store.get('usage')) as Usage | undefined) ?? { since: now, items: {} }
  const it = usage.items[key] ?? { count: 0, last: 0 }
  usage.items[key] = { count: it.count + 1, last: now }
  await $.store.set('usage', usage)
}

const ago = (now: number, t: number) => {
  const d = Math.floor((now - t) / DAY)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

// One line on how much it is used, and whether it earns its context cost.
function usageLine(r: Row, now: number, since: number): { text: string; isIdle: boolean } {
  if (r.uses) return { text: `Used ${r.uses}× · last ${ago(now, r.lastUsed!)}`, isIdle: now - r.lastUsed! > IDLE_DAYS * DAY && r.tokens > 0 }
  const tracked = since ? Math.floor((now - since) / DAY) : 0
  return { text: since ? `Not used since kit started counting (${tracked}d ago)` : 'Not used yet', isIdle: tracked >= IDLE_DAYS && r.tokens > 0 }
}


// Apple dark-mode system colors
const BLUE = '#0A84FF'
const GREEN = '#30D158'
const SYS_GRAY = '#8E8E93'
const SEPARATOR = '#3A3A3C'

// Round avatar (Instagram style): the owner's photo clipped to a circle, or a monogram on graphite.
// `ring`: 'live' = Instagram gradient story ring (active in this chat), 'idle' = thin gray ring (on, not loaded),
// 'off' = no ring and a faded photo. Without `ring` it is a plain round photo (list rows).
function appIcon(uri: string | undefined, name: string, size: number, ring?: 'live' | 'idle' | 'off') {
  const c = size / 2
  const photoR = ring ? c - 5 : c
  const inner = uri
    ? `<image href="${uri}" x="${c - photoR}" y="${c - photoR}" width="${photoR * 2}" height="${photoR * 2}" clip-path="url(#q)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${c}" cy="${c}" r="${photoR}" fill="#2C2C2E"/>` +
      `<text x="${c}" y="${c + photoR * 0.32}" text-anchor="middle" font-family="-apple-system, 'SF Pro Display', 'Segoe UI', sans-serif" font-weight="600" font-size="${photoR * 0.9}" fill="#F5F5F7">${(name[0] ?? '?').toUpperCase()}</text>`
  const outline = ring === 'live'
    ? `<circle cx="${c}" cy="${c}" r="${c - 1.5}" fill="none" stroke="url(#ig)" stroke-width="3"/>`
    : ring === 'idle'
      ? `<circle cx="${c}" cy="${c}" r="${c - 1}" fill="none" stroke="${SEPARATOR}" stroke-width="1.5"/>`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><clipPath id="q"><circle cx="${c}" cy="${c}" r="${photoR}"/></clipPath>` +
    `<linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset="0.35" stop-color="#FA7E1E"/>` +
    `<stop offset="0.65" stop-color="#D62976"/><stop offset="1" stop-color="#962FBF"/></linearGradient></defs>` +
    `<g${ring === 'off' ? ' opacity="0.35"' : ''}>${inner}</g>${outline}</svg>`
}

// What an installed item does, cut to `max` characters for a hover card or a detail card.
const about = (r: Row, max: number) =>
  r.about ? (r.about.length > max ? `${r.about.slice(0, max - 1)}…` : r.about) : 'No description provided.'

const stars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`)


type McpDef = Record<string, unknown>

async function paths($: any) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const claude = `${home}/.claude`
  return { home, isWindows, skills: `${claude}/skills`, offSkills: `${claude}/kit-off/skills`, offMcp: `${claude}/kit-off/mcp.json`, config: `${home}/.claude.json`,
    sources: `${claude}/kit-off/sources.json`, avatars: `${claude}/kit-off/avatars`, marketplaces: `${claude}/plugins/known_marketplaces.json` }
}

// GitHub owner avatar as a data: URI, downloaded once and cached on disk.
async function avatar($: any, repo: string | undefined): Promise<string | undefined> {
  const owner = repo?.split('/')[0]
  if (!owner || !/^[\w.-]+$/.test(owner)) return undefined
  const p = await paths($)
  // 40px is enough for a 42px ring and keeps each data: URI small: a drawn tree may serialize to 100,000 characters in all.
  const file = `${p.avatars}/${owner}-40.png`
  try {
    if (!(await $.fs.exists(file))) {
      await $.fs.write(`${p.avatars}/.kit`, '')
      const r = await $.process.run(['curl', '-sfL', '-o', file, `https://github.com/${owner}.png?size=40`], { timeoutMs: 20_000 })
      if (r.exitCode !== 0) return undefined
    }
    const { base64 } = await $.fs.read(file, { as: 'bytes' })
    return `data:image/png;base64,${base64}`
  } catch { return undefined }
}

async function readJson<T>($: any, path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await $.fs.read(path)) as T } catch { return fallback }
}

async function dirs($: any, path: string): Promise<string[]> {
  try { return (await $.fs.list(path)).filter((e: any) => e.kind === 'dir').map((e: any) => e.name) } catch { return [] }
}

async function claudeCli($: any, args: string[]) {
  const r = await $.process.run(['claude', ...args], { timeoutMs: 120_000 })
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').pop() || `claude ${args[0]} failed`)
  return r.stdout
}

// A SKILL.md frontmatter `description`, inline ("…") or as a folded/literal block (>, |).
function skillDescription(md: string): string | undefined {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return undefined
  const lines = fm[1].split(/\r?\n/)
  const i = lines.findIndex(l => /^description:/.test(l))
  if (i < 0) return undefined
  let v = lines[i].replace(/^description:\s*/, '')
  if (v === '' || /^[>|][-+]?$/.test(v)) {
    const block: string[] = []
    for (const l of lines.slice(i + 1)) { if (/^\S/.test(l)) break; block.push(l.trim()) }
    v = block.join(' ')
  }
  return v.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim() || undefined
}

const repoAbout = new Map<string, string>() // GitHub descriptions, fetched once per load

async function scan($: any): Promise<Inventory> {
  const p = await paths($)
  const usage = await $.session.usage({ breakdown: 'summary' })
  const bd = usage.context.breakdown
  const listed = bd?.skills?.skillFrontmatter ?? []
  const tools = bd?.mcpTools ?? []
  const rows: Row[] = []

  // Plugins (marketplace installs)
  const plugins = JSON.parse(await claudeCli($, ['plugin', 'list', '--json'])) as { id: string; enabled: boolean; installPath: string; version?: string }[]
  for (const pl of plugins) {
    const name = pl.id.split('@')[0]
    const mine = listed.filter((s: any) => s.pluginName === name)
    const manifest = await readJson<{ description?: string }>($, `${pl.installPath}/.claude-plugin/plugin.json`, {})
    rows.push({ kind: 'plugin', id: pl.id, name, isOn: pl.enabled, isLoaded: mine.length > 0,
      tokens: mine.reduce((n: number, s: any) => n + s.tokens, 0), canToggle: true, about: manifest.description, version: pl.version })
  }

  // Personal skills in ~/.claude/skills (and the ones kit parked)
  for (const [folder, isOn] of [[p.skills, true], [p.offSkills, false]] as const) {
    for (const name of await dirs($, folder)) {
      const hit = listed.find((s: any) => s.name === name && !s.pluginName)
      let desc: string | undefined
      try { desc = skillDescription(await $.fs.read(`${folder}/${name}/SKILL.md`)) } catch { /* no SKILL.md at the top */ }
      rows.push({ kind: 'skill', id: name, name, isOn, isLoaded: !!hit, tokens: hit?.tokens ?? 0, canToggle: true, about: desc })
    }
  }

  // MCP servers: user-scope ones are switchable; others (project, plugin, claude.ai) are shown read-only
  const config = await readJson<{ mcpServers?: Record<string, McpDef> }>($, p.config, {})
  const parked = await readJson<Record<string, McpDef>>($, p.offMcp, {})
  const servers = new Set<string>([...Object.keys(config.mcpServers ?? {}), ...tools.map((t: any) => t.serverName)])
  for (const name of servers) {
    // Only loaded tool schemas sit in context; deferred ones cost nothing until searched for.
    const loaded = tools.filter((t: any) => t.serverName === name && t.isLoaded)
    rows.push({ kind: 'mcp', id: name, name, isOn: true, isLoaded: loaded.length > 0,
      tokens: loaded.reduce((n: number, t: any) => n + t.tokens, 0), canToggle: name in (config.mcpServers ?? {}) })
  }
  for (const name of Object.keys(parked)) rows.push({ kind: 'mcp', id: name, name, isOn: false, isLoaded: false, tokens: 0, canToggle: true })

  // Where each item came from: plugins from Claude Code's marketplace record, the rest from kit's own sources.json.
  const markets = await readJson<Record<string, { source?: { repo?: string } }>>($, p.marketplaces, {})
  const sources = await readJson<Record<string, string>>($, p.sources, {})
  for (const r of rows) {
    r.repo = r.kind === 'plugin' ? markets[r.id.split('@')[1]]?.source?.repo : sources[r.name]
  }
  const counted = ((await $.store.get('usage')) as Usage | undefined)
  for (const r of rows) {
    const u = counted?.items[`${r.kind}:${r.name}`]
    if (u) { r.uses = u.count; r.lastUsed = u.last }
  }
  if (counted) await update($, usageSince, () => counted.since)

  await Promise.all(rows.filter(r => r.canToggle).map(async r => {
    r.avatar = await avatar($, r.repo)
    if (!r.about && r.repo) {
      if (!repoAbout.has(r.repo)) {
        try { repoAbout.set(r.repo, JSON.parse(await gh($, ['api', `repos/${r.repo}`])).description ?? '') } catch { repoAbout.set(r.repo, '') }
      }
      r.about = repoAbout.get(r.repo) || undefined
    }
  }))

  await Promise.all(rows.filter(r => r.kind === 'plugin' && r.repo).map(async r => { r.latest = await latestVersion($, r.repo!, r.name) }))

  return { rows, tokens: rows.reduce((n, r) => n + r.tokens, 0), window: usage.context.window }
}

async function toggle($: any, kind: Kind, id: string, isOn: boolean) {
  const p = await paths($)
  if (kind === 'plugin') {
    await claudeCli($, ['plugin', isOn ? 'disable' : 'enable', id])
  } else if (kind === 'skill') {
    const [from, to] = isOn ? [p.skills, p.offSkills] : [p.offSkills, p.skills]
    await $.fs.write(`${to}/.kit`, '') // make sure the target folder exists
    const src = `${from}/${id}`, dst = `${to}/${id}`
    const argv = p.isWindows
      ? ['cmd', '/c', 'move', src.replace(/\//g, '\\'), dst.replace(/\//g, '\\')]
      : ['mv', src, dst]
    const r = await $.process.run(argv)
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim() || 'move failed')
  } else {
    const parked = await readJson<Record<string, McpDef>>($, p.offMcp, {})
    if (isOn) {
      // Park the exact definition first, so turning it back on restores it unchanged.
      const config = await readJson<{ mcpServers?: Record<string, McpDef> }>($, p.config, {})
      const def = config.mcpServers?.[id]
      if (!def) throw new Error(`${id} is not a user-scope server`)
      await $.fs.write(p.offMcp, JSON.stringify({ ...parked, [id]: def }, null, 2))
      await claudeCli($, ['mcp', 'remove', id, '-s', 'user'])
    } else {
      await claudeCli($, ['mcp', 'add-json', id, JSON.stringify(parked[id]), '-s', 'user'])
      const { [id]: _, ...rest } = parked
      await $.fs.write(p.offMcp, JSON.stringify(rest, null, 2))
    }
  }
}

// ---------- Install from GitHub: inspect first, run only after the person presses Install ----------

const safe = (s: string) => s.replace(/[^\w.-]/g, '-')

async function gh($: any, args: string[]) {
  const r = await $.process.run(['gh', ...args], { timeoutMs: 60_000 })
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').pop() || 'gh failed')
  return r.stdout
}

// The repo's own social preview, if its owner uploaded one (GitHub's auto-generated card is skipped:
// it is just the avatar and the name). Shrunk to a 320x160 JPEG cover so it fits the drawn tree's budget.
// Windows only (System.Drawing ships with it); elsewhere the card simply has no cover.
async function banner($: any, repo: string): Promise<string | undefined> {
  const p = await paths($)
  if (!p.isWindows) return undefined
  try {
    const [owner, name] = repo.split('/')
    const q = `{repository(owner:"${owner}",name:"${name}"){usesCustomOpenGraphImage openGraphImageUrl}}`
    const og = JSON.parse(await gh($, ['api', 'graphql', '-f', `query=${q}`])).data.repository
    if (!og?.usesCustomOpenGraphImage) return undefined
    const base = `${p.avatars}/${safe(repo)}-og`
    const out = `${base}.jpg`
    if (!(await $.fs.exists(out))) {
      await $.fs.write(`${p.avatars}/.kit`, '')
      const src = `${base}-src`
      const got = await $.process.run(['curl', '-sfL', '-o', src, og.openGraphImageUrl], { timeoutMs: 30_000 })
      if (got.exitCode !== 0) return undefined
      const win = (s: string) => s.replace(/\//g, '\\').replace(/'/g, "''")
      // Scale to cover 320x160, centre-crop, save as JPEG.
      const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${win(src)}');` +
        `$k=[Math]::Max(320/$s.Width,160/$s.Height); $w=[int]($s.Width*$k); $h=[int]($s.Height*$k);` +
        `$b=New-Object System.Drawing.Bitmap 320,160; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic';` +
        `$g.DrawImage($s,[int]((320-$w)/2),[int]((160-$h)/2),$w,$h); $b.Save('${win(out)}',[System.Drawing.Imaging.ImageFormat]::Jpeg);` +
        `$g.Dispose(); $b.Dispose(); $s.Dispose()`
      const r = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', ps], { timeoutMs: 30_000 })
      if (r.exitCode !== 0 || !(await $.fs.exists(out))) return undefined
    }
    const { base64 } = await $.fs.read(out, { as: 'bytes' })
    return `data:image/jpeg;base64,${base64}`
  } catch { return undefined }
}

async function inspect($: any, spec: string): Promise<Plan> {
  const m = spec.trim().match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/)
  if (!m) throw new Error('Paste owner/repo or a github.com link')
  const meta = JSON.parse(await gh($, ['api', `repos/${m[1]}/${m[2]}`]))
  const repo: string = meta.full_name
  const name = safe(meta.name)
  const tree: string[] = JSON.parse(await gh($, ['api', `repos/${repo}/git/trees/${meta.default_branch}?recursive=1`]))
    .tree.map((t: any) => t.path)
  const raw = (path: string) => gh($, ['api', `repos/${repo}/contents/${path}`, '-H', 'Accept: application/vnd.github.raw'])
  const p = await paths($)
  const base: Plan = {
    repo, kind: 'unknown', names: [], stars: meta.stargazers_count, pushedAt: String(meta.pushed_at).slice(0, 10),
    license: meta.license?.spdx_id ?? 'none', description: meta.description ?? '', steps: [], note: '',
    banner: await banner($, repo),
    warnings: [
      ...(meta.archived ? ['Archived by its owner: no more fixes or updates.'] : []),
      ...(Date.now() - Date.parse(meta.pushed_at) > 365 * DAY ? [`No commits for over a year (last ${String(meta.pushed_at).slice(0, 10)}).`] : []),
      ...(!meta.license ? ['No license: you may not be allowed to use or share it.'] : []),
    ],
  }

  // 1. Claude Code plugin marketplace
  if (tree.includes('.claude-plugin/marketplace.json')) {
    const mj = JSON.parse(await raw('.claude-plugin/marketplace.json'))
    const names: string[] = (mj.plugins ?? []).map((x: any) => x.name)
    return { ...base, kind: 'plugin', names,
      steps: [['claude', 'plugin', 'marketplace', 'add', repo], ...names.map(n => ['claude', 'plugin', 'install', `${n}@${mj.name}`])] }
  }

  // 2. Skills: any folder holding a SKILL.md
  const skillDirs = tree.filter(t => /(^|\/)SKILL\.md$/.test(t)).map(t => t.slice(0, -'SKILL.md'.length).replace(/\/$/, ''))
  if (skillDirs.length) {
    const tmp = `${p.home}/.claude/kit-off/tmp/${name}-${Date.now()}`
    // A skill's name is its folder's, unless the folder is generic (agent_reach/skill/): then the SKILL.md's `name:`.
    const generic = /^(skills?|src|\.claude|)$/i
    const skills = await Promise.all(skillDirs.map(async d => {
      const folder = d.split('/').pop() ?? ''
      const declared = generic.test(folder)
        ? (await raw(`${d ? `${d}/` : ''}SKILL.md`)).match(/^name:\s*["']?([\w.-]+)/m)?.[1]
        : undefined
      return { src: d ? `${tmp}/${d}` : tmp, name: safe(declared ?? (generic.test(folder) ? name : folder)) }
    }))
    const fresh: typeof skills = [], taken: string[] = []
    for (const s of skills) ((await $.fs.exists(`${p.skills}/${s.name}`)) ? taken : fresh).push(s as any)
    return { ...base, kind: 'skill', names: fresh.map(s => s.name),
      steps: fresh.length ? [['git', 'clone', '--depth', '1', `https://github.com/${repo}.git`, tmp], ...fresh.map(s => ['copy', s.src, `${p.skills}/${s.name}`])] : [],
      note: taken.length ? `Already installed, skipped: ${taken.join(', ')}` : '' }
  }

  // 3. MCP server published to npm
  if (tree.includes('package.json')) {
    const pj = JSON.parse(await raw('package.json'))
    const deps = { ...pj.dependencies, ...pj.devDependencies }
    if (pj.bin && !pj.private && ('@modelcontextprotocol/sdk' in deps || /mcp/i.test(pj.name))) {
      const onNpm = (await $.http.fetch(`https://registry.npmjs.org/${pj.name}`)).ok
      if (onNpm) {
        return { ...base, kind: 'mcp', names: [name],
          steps: [['claude', 'mcp', 'add', name, '-s', 'user', '--', ...(p.isWindows ? ['cmd', '/c'] : []), 'npx', '-y', pj.name]],
          note: 'If the server needs API keys, add them with `claude mcp add -e KEY=…` after installing.' }
      }
    }
  }

  // 4. MCP server as a Python package (run from GitHub with uvx)
  if (tree.includes('pyproject.toml')) {
    const toml = await raw('pyproject.toml')
    const script = toml.match(/\[project\.scripts\]\s*\n\s*["']?([\w.-]+)["']?\s*=/)?.[1]
    if (script && /mcp/i.test(toml)) {
      return { ...base, kind: 'mcp', names: [name],
        steps: [['claude', 'mcp', 'add', name, '-s', 'user', '--', 'uvx', '--from', `git+https://github.com/${repo}`, script]],
        note: 'Needs uv installed. If the server needs API keys, add them after installing.' }
    }
  }

  return { ...base, note: 'Could not tell how to install this repo automatically. Check its README.' }
}

async function install($: any, pl: Plan) {
  const p = await paths($)
  for (const step of pl.steps) {
    await update($, busy, () => `running: ${step.join(' ')}`)
    if (step[0] === 'copy') {
      const [, src, dst] = step
      const argv = p.isWindows
        ? ['xcopy', src.replace(/\//g, '\\'), dst.replace(/\//g, '\\'), '/E', '/I', '/Y', '/Q']
        : ['cp', '-R', src, dst]
      const r = await $.process.run(argv, { timeoutMs: 120_000 })
      if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim() || 'copy failed')
      continue
    }
    const r = await $.process.run(step, { timeoutMs: 600_000 })
    if (r.exitCode !== 0) throw new Error(`${step.slice(0, 3).join(' ')}: ${(r.stderr || r.stdout).trim().split('\n').pop()}`)
  }
}

// Free text: search GitHub for Claude Code extensions about it, merged and ranked by stars.
async function search($: any, text: string) {
  const q = text.trim()
  await update($, busy, () => `searching GitHub for "${q}"…`)
  await update($, query, () => q)
  try {
    // Topic searches find renamed repos (ahujasid/mcp-for-blender) that text search misses; text searches find untagged ones.
    const variants = [
      ...['mcp', 'claude-code', 'agent-skills', 'claude-skills'].map(t => ['--topic', t, q]),
      [`${q} mcp`], [`${q} skill`],
    ]
    const runs = await Promise.all(variants.map(async v => {
      try {
        return JSON.parse(await gh($, ['search', 'repos', ...v, '--sort', 'stars', '--limit', '15',
          '--json', 'fullName,stargazersCount,description,updatedAt'])) as any[]
      } catch { return [] }
    }))
    const seen = new Map<string, Hit>()
    for (const r of runs.flat()) {
      if (!seen.has(r.fullName)) seen.set(r.fullName, { repo: r.fullName, stars: r.stargazersCount,
        description: (r.description ?? '').slice(0, 90), updatedAt: String(r.updatedAt).slice(0, 10) })
    }
    const top = [...seen.values()].sort((a, b) => b.stars - a.stars).slice(0, 15)
    await Promise.all(top.map(async hit => { hit.avatar = await avatar($, hit.repo) }))
    await update($, hits, () => top)
    await update($, plan, () => null)
  } catch (err) {
    $.ui.toast(`kit: ${String((err as Error).message ?? err)}`)
  }
  await update($, busy, () => '')
}

// Top Charts: the most-starred installable extensions (skill and plugin topics; MCP/app topics pull in whole apps).
async function loadTop($: any, force = false) {
  if (!force && (await read($, top))) return
  const runs = await Promise.all(['agent-skills', 'claude-skills', 'claude-code-plugin'].map(async t => {
    try {
      return JSON.parse(await gh($, ['search', 'repos', '--topic', t, '--sort', 'stars', '--limit', '12',
        '--json', 'fullName,stargazersCount,description,updatedAt'])) as any[]
    } catch { return [] }
  }))
  const seen = new Map<string, Hit>()
  for (const r of runs.flat()) {
    if (!seen.has(r.fullName)) seen.set(r.fullName, { repo: r.fullName, stars: r.stargazersCount,
      description: (r.description ?? '').slice(0, 90), updatedAt: String(r.updatedAt).slice(0, 10) })
  }
  // awesome-* repos are lists of extensions, not something to install
  const best = [...seen.values()].filter(x => !/^awesome[-_]/i.test(x.repo.split('/')[1] ?? '')).sort((a, b) => b.stars - a.stars).slice(0, 8)
  await Promise.all(best.map(async hit => { hit.avatar = await avatar($, hit.repo) }))
  await update($, top, () => best)
}

async function submit($: any, text: string) {
  const t = text.trim()
  if (!t) return
  // owner/repo or a github.com link goes straight to the install check; anything else is a search
  if (/github\.com\//.test(t) || /^[\w.-]+\/[\w.-]+$/.test(t)) return check($, t)
  return search($, t)
}

async function check($: any, spec: string) {
  if (!spec.trim()) return
  await update($, busy, () => `inspecting ${spec.trim()}…`)
  try {
    const pl = await inspect($, spec)
    await update($, plan, () => pl)
  } catch (err) {
    $.ui.toast(`kit: ${String((err as Error).message ?? err)}`)
  }
  await update($, busy, () => '')
}

async function confirm($: any) {
  const pl = await read($, plan)
  if (!pl) return
  try {
    await install($, pl)
    const p = await paths($)
    const sources = await readJson<Record<string, string>>($, p.sources, {})
    for (const n of pl.names) sources[n] = pl.repo
    await $.fs.write(p.sources, JSON.stringify(sources, null, 2))
    await update($, changed, () => true)
    $.ui.toast(`Installed ${pl.names.join(', ')}: run /reload-plugins to apply`)
    await update($, plan, () => null)
  } catch (err) {
    $.ui.toast(`kit: install stopped: ${String((err as Error).message ?? err)}`)
  }
  await refresh($)
}

// The newest version a plugin's marketplace publishes: the marketplace entry's `version`, else the
// plugin.json at the entry's source path. Undefined when it cannot tell (no version anywhere, remote source).
const latestCache = new Map<string, { at: number; version?: string }>()
async function latestVersion($: any, repo: string, plugin: string): Promise<string | undefined> {
  const key = `${repo}#${plugin}`
  const now = await $.clock.now()
  const hit = latestCache.get(key)
  if (hit && now - hit.at < 10 * 60_000) return hit.version
  let version: string | undefined
  try {
    const raw = async (path: string) => JSON.parse(await gh($, ['api', `repos/${repo}/contents/${path}`, '-H', 'Accept: application/vnd.github.raw']))
    const market = await raw('.claude-plugin/marketplace.json')
    const entry = (market.plugins ?? []).find((x: any) => x.name === plugin)
    if (entry?.version) version = String(entry.version)
    else if (typeof entry?.source === 'string') {
      const dir = entry.source.replace(/^\.\//, '').replace(/\/$/, '')
      version = (await raw(`${dir ? `${dir}/` : ''}.claude-plugin/plugin.json`)).version
    }
  } catch { /* offline, rate-limited or no marketplace file: no update info */ }
  latestCache.set(key, { at: now, version })
  return version
}

const hasUpdate = (r: Row) => !!(r.version && r.latest && r.version !== r.latest)

// Update a plugin the way Claude Code does it by hand: refresh its marketplace, then update the plugin.
async function upgrade($: any, r: Row) {
  await update($, busy, () => `updating ${r.name} to ${r.latest}…`)
  try {
    await claudeCli($, ['plugin', 'marketplace', 'update', r.id.split('@')[1]])
    await claudeCli($, ['plugin', 'update', r.id])
    latestCache.clear()
    await update($, changed, () => true)
    $.ui.toast(`${r.name} updated to ${r.latest}: restart Claude Code to apply`)
  } catch (err) {
    $.ui.toast(`kit: ${String((err as Error).message ?? err)}`)
  }
  await refresh($)
}

// Remove an installed item. Nothing is deleted outright: a plugin goes through Claude Code's own uninstall,
// a skill folder and an MCP definition are moved to ~/.claude/kit-off/removed so a mistake can be undone by hand.
async function remove($: any, r: Row) {
  const p = await paths($)
  await update($, busy, () => `removing ${r.name}…`)
  try {
    if (r.kind === 'plugin') {
      await claudeCli($, ['plugin', 'uninstall', r.id])
    } else if (r.kind === 'skill') {
      const from = r.isOn ? p.skills : p.offSkills
      const bin = `${p.home}/.claude/kit-off/removed`
      await $.fs.write(`${bin}/.kit`, '')
      const src = `${from}/${r.id}`, dst = `${bin}/${r.id}-${await $.clock.now()}`
      const argv = p.isWindows ? ['cmd', '/c', 'move', src.replace(/\//g, '\\'), dst.replace(/\//g, '\\')] : ['mv', src, dst]
      const res = await $.process.run(argv)
      if (res.exitCode !== 0) throw new Error((res.stderr || res.stdout).trim() || 'move failed')
    } else {
      const config = await readJson<{ mcpServers?: Record<string, McpDef> }>($, p.config, {})
      const parked = await readJson<Record<string, McpDef>>($, p.offMcp, {})
      const def = config.mcpServers?.[r.id] ?? parked[r.id]
      const binFile = `${p.home}/.claude/kit-off/removed/mcp.json`
      const bin = await readJson<Record<string, McpDef>>($, binFile, {})
      await $.fs.write(binFile, JSON.stringify({ ...bin, [r.id]: def }, null, 2))
      if (r.isOn) await claudeCli($, ['mcp', 'remove', r.id, '-s', 'user'])
      else { const { [r.id]: _, ...rest } = parked; await $.fs.write(p.offMcp, JSON.stringify(rest, null, 2)) }
    }
    await update($, changed, () => true)
    await update($, selected, () => '')
    $.ui.toast(`${r.name} removed: run /reload-plugins to apply`)
  } catch (err) {
    $.ui.toast(`kit: ${String((err as Error).message ?? err)}`)
  }
  await update($, removing, () => '')
  await refresh($)
}

async function flip($: any, r: Row) {
  await update($, busy, () => `${r.isOn ? 'turning off' : 'turning on'} ${r.name}…`)
  try {
    await toggle($, r.kind, r.id, r.isOn)
    await update($, changed, () => true)
    $.ui.toast(`${r.name} ${r.isOn ? 'off' : 'on'}: run /reload-plugins to apply`)
  } catch (err) {
    $.ui.toast(`kit: ${String((err as Error).message ?? err)}`)
  }
  await refresh($)
}

async function refresh($: any, force = false) {
  await update($, busy, () => 'scanning…')
  try {
    const inv = await scan($)
    await update($, inventory, () => inv)
    await loadTop($, force)
  } catch (err) {
    await update($, inventory, inv => ({ ...inv, error: String((err as Error).message ?? err) }))
  }
  await update($, busy, () => '')
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

// The person's own items, listed one by one; the app's built-in servers and claude.ai connectors fold into one line.
function split(inv: Inventory, kind: Kind) {
  const rows = inv.rows.filter(r => r.kind === kind).sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
  const own = rows.filter(r => kind !== 'mcp' || r.canToggle)
  const app = rows.filter(r => kind === 'mcp' && !r.canToggle)
  return { own, app, appTokens: app.reduce((n, r) => n + r.tokens, 0) }
}
const TITLES: Record<Kind, string> = { plugin: 'Plugins', skill: 'Skills', mcp: 'MCP servers' }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'kit', description: 'Show your skills, plugins and MCP servers: active, context cost, on/off' })
    await update($, changed, () => false)
    void refresh($) // fill the dock in the background; no /kit needed
    return next(e)
  })

  // Count real use: every MCP tool call and every Skill call, credited to the item it belongs to.
  on('tool.call', async ($, e, next) => {
    const key = usageKey(e)
    if (key) void recordUse($, key)
    return next(e)
  })

  on('command.run', { command: 'kit' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Kit' })
    await refresh($)
    const inv = await read($, inventory)
    if (inv.error) return { text: `Kit opened, but the scan failed: ${inv.error}` }
    const line = (k: Kind) => {
      const { own, app, appTokens } = split(inv, k)
      return `${TITLES[k]} ${own.filter(r => r.isOn).length}/${own.length} on: ` +
        own.map(r => `${r.name}${r.isOn ? '' : ' (off)'}${r.isLoaded ? ` ${fmt(r.tokens)}` : ''}`).join(', ') +
        (app.length ? ` | +${app.length} app/connector servers ${fmt(appTokens)}` : '')
    }
    return { text: [`Kit: ${fmt(inv.tokens)} tok always-on of ${fmt(inv.window)}.`, line('plugin'), line('skill'), line('mcp')].join('\n') }
  })

  // The dock: an auto-hiding strip above the prompt, like the macOS Dock. At rest only a small handle shows;
  // pointing at it reveals the installed icons, pointing at an icon shows its name, status and cost.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const inv = await read($, inventory)
    const own = (['plugin', 'skill', 'mcp'] as Kind[]).flatMap(k => split(inv, k).own)
    if (own.length === 0) return next(e)
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as any
    const hasSvg = e.surface !== 'terminal'
    const rank = (r: Row) => (r.isLoaded ? 0 : r.isOn ? 1 : 2)
    const icons = [...own].sort((a, b) => rank(a) - rank(b) || b.tokens - a.tokens || a.name.localeCompare(b.name))
    let budget = 60_000
    const fit = (uri?: string) => (uri && uri.length <= budget ? ((budget -= uri.length), uri) : undefined)
    const live = own.filter(r => r.isLoaded).length
    const since = await read($, usageSince)
    const now = await $.clock.now()

    return (
      <Box key="kit-dock" flexDirection="row" justifyContent="flex-end" alignItems="center" gap={1}>
        <Box flexDirection="row" gap={1} alignItems="center" display="none" hover={{ display: 'flex' }}>
          {icons.map(r => {
            const key = `${r.kind}:${r.id}`
            const ring = r.isLoaded ? 'live' : r.isOn ? 'idle' : 'off'
            const tip = `${r.name}, ${r.isLoaded ? 'active' : r.isOn ? 'on' : 'off'}`
            return (
              <Box key={`dock-${key}`} flexDirection="column" alignItems="center">
                {/* Hover card: what it is, what it costs, what it does. Sits above the icon, over the transcript. */}
                <Box position="absolute" top={-9} left={-20} width={44} display="none" hover={{ display: 'flex' }}
                  flexDirection="column" borderStyle="round" borderColor={SEPARATOR} backgroundColor="#1C1C1E" paddingX={1}>
                  <Text bold>{r.name} <Text color={SYS_GRAY}>· {r.kind}</Text></Text>
                  <Text color={r.isLoaded ? GREEN : SYS_GRAY}>
                    {r.isLoaded ? `Active in this chat · ${fmt(r.tokens)} tokens` : r.isOn ? 'On · not loaded in this chat' : 'Off'}
                  </Text>
                  <Text>{about(r, 150)}</Text>
                  <Text color={SYS_GRAY}>{usageLine(r, now, since).text}</Text>
                </Box>
                {hasSvg
                  ? <Svg source={appIcon(fit(r.avatar), r.name, 32, ring)} alt={tip} width={32} height={32} />
                  : <Text color={r.isLoaded ? GREEN : SYS_GRAY}>{r.isOn ? '●' : '○'}</Text>}
              </Box>
            )
          })}
          <Button key="dock-open" label="Open" variant="primary"
            onPress={() => { void $.ui.open({ id: PANE, title: 'Kit' }); void refresh($) }} />
        </Box>
        <Text color={SYS_GRAY}>◖ kit · {live} active</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Svg } = $.ui.resolve(e) as any
    const hasSvg = e.surface !== 'terminal'
    const inv = await read($, inventory)
    const status = await read($, busy)
    const isChanged = await read($, changed)
    const pl = await read($, plan)
    const sel = await read($, selected)
    const found = await read($, hits)
    const q = await read($, query)
    const charts = await read($, top)
    const sure = await read($, removing)
    const since = await read($, usageSince)
    const now = await $.clock.now()
    const pct = inv.window ? Math.round((inv.tokens / inv.window) * 100) : 0

    // Installed: the person's own items, active-in-chat first, then on, then off.
    const own = (['plugin', 'skill', 'mcp'] as Kind[]).flatMap(k => split(inv, k).own)
    const rank = (r: Row) => (r.isLoaded ? 0 : r.isOn ? 1 : 2)
    const installed = [...own].sort((a, b) => rank(a) - rank(b) || b.tokens - a.tokens || a.name.localeCompare(b.name))
    const app = split(inv, 'mcp')
    const pick = installed.find(r => `${r.kind}:${r.id}` === sel)
    const isSearching = !!found
    const ownRepos = new Set(installed.map(r => r.repo).filter(Boolean))

    // The whole tree must serialize under 100,000 characters: embedded icons share a 60k budget (a 15-result search measured 109k at 80k in tests).
    // Installed first, then the visible list (search results replace Top Charts, as in the App Store).
    let budget = 60_000
    const fit = (uri?: string) => (uri && uri.length <= budget ? ((budget -= uri.length), uri) : undefined)
    const cover = fit(pl?.banner) // the open card's cover goes first: it is what the person is looking at
    const ownIcons = new Map(installed.map(r => [`${r.kind}:${r.id}`, fit(r.avatar)]))
    const listIcons = new Map(((isSearching ? found : charts) ?? []).map(hit => [hit.repo, fit(hit.avatar)]))
    const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
    const label = (repo: string) => repo.split('/')[1] ?? repo

    // One App Store row: icon, name, subtitle, ★ and a Get pill (or "Installed" when it is already yours).
    const row = (hit: Hit, i?: number) => (
      <Box key={`row-${hit.repo}`} flexDirection="row" gap={1} alignItems="center">
        {i !== undefined && <Text color={SYS_GRAY}>{i + 1}</Text>}
        {hasSvg && <Svg source={appIcon(listIcons.get(hit.repo), label(hit.repo), 44)} alt={label(hit.repo)} width={44} height={44} />}
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Text bold>{short(label(hit.repo), 28)}</Text>
          <Text color={SYS_GRAY}>{short(hit.description || hit.repo, 52)}</Text>
          <Text color={SYS_GRAY}>★ {stars(hit.stars)} · {hit.repo.split('/')[0]}</Text>
        </Box>
        {ownRepos.has(hit.repo)
          ? <Text color={SYS_GRAY}>Installed</Text>
          : <Button key={`get:${hit.repo}`} label="Get" variant="primary" onPress={() => void check($, hit.repo)} />}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text color={SYS_GRAY}>{fmt(inv.tokens)} tokens in context · {pct}% of {fmt(inv.window)}</Text>
          {installed.some(hasUpdate) && <Text color={BLUE}>· {installed.filter(hasUpdate).length} update{installed.filter(hasUpdate).length > 1 ? 's' : ''}</Text>}
          <Button key="refresh" label="Refresh" hotkey="r" plain onPress={() => void refresh($, true)} />
        </Box>

        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {installed.map(r => {
            const key = `${r.kind}:${r.id}`
            const open = () => void update($, selected, cur => (cur === key ? '' : key))
            const ring = r.isLoaded ? 'live' : r.isOn ? 'idle' : 'off'
            return (
              <Box key={`app-${key}`} flexDirection="column" alignItems="center" width={10}>
                <Box position="absolute" top={-7} left={-2} width={40} display="none" hover={{ display: 'flex' }}
                  flexDirection="column" borderStyle="round" borderColor={SEPARATOR} backgroundColor="#1C1C1E" paddingX={1}>
                  <Text bold>{r.name} <Text color={SYS_GRAY}>· {r.kind}</Text></Text>
                  <Text>{about(r, 120)}</Text>
                  <Text color={SYS_GRAY}>{usageLine(r, now, since).text}</Text>
                </Box>
                {hasSvg
                  ? <Svg source={appIcon(ownIcons.get(key), r.name, 64, ring)} alt={`${r.name}, ${r.isLoaded ? 'active' : r.isOn ? 'on' : 'off'}`} width={64} height={64} />
                  : <Text color={r.isLoaded ? GREEN : SYS_GRAY}>{r.isOn ? '●' : '○'}</Text>}
                <Button key={`s:${key}`} label={short(r.name, 10)} plain dimColor={!r.isOn} onPress={open} />
              </Box>
            )
          })}
        </Box>
        {app.app.length > 0 && <Text color={SYS_GRAY}>+ {app.app.length} built-in app and connector servers · {fmt(app.appTokens)} tokens</Text>}

        {pick && (
          <Box flexDirection="column" borderStyle="round" borderColor={SEPARATOR} paddingX={1}>
            <Text bold>{pick.name}</Text>
            <Text color={SYS_GRAY}>{pick.kind}{pick.repo ? ` · ${pick.repo}` : ''}</Text>
            <Text color={pick.isLoaded ? GREEN : SYS_GRAY}>{pick.isLoaded ? `Active in this chat · ${fmt(pick.tokens)} tokens` : pick.isOn ? 'On · not loaded in this chat' : 'Off'}</Text>
            <Text>{about(pick, 400)}</Text>
            {hasUpdate(pick) && (
              <Box flexDirection="row" gap={2} alignItems="center">
                <Text color={BLUE}>Update available: {pick.version} → {pick.latest}</Text>
                <Button key={`up:${pick.id}`} label="Update" variant="primary" onPress={() => void upgrade($, pick)} />
              </Box>
            )}
            <Text color={SYS_GRAY}>{usageLine(pick, now, since).text}</Text>
            {pick.isOn && usageLine(pick, now, since).isIdle && (
              <Text color="#FF9F0A">Idle for {IDLE_DAYS}+ days: turning it off frees ~{fmt(pick.tokens)} tokens in every chat.</Text>
            )}
            {sure === `${pick.kind}:${pick.id}` ? (
              <Box flexDirection="row" gap={2}>
                <Text color="#FF453A">Remove {pick.name}? {pick.kind === 'plugin' ? 'It is uninstalled.' : 'It is moved to ~/.claude/kit-off/removed.'}</Text>
                <Button key={`rm-go:${pick.kind}:${pick.id}`} label="Remove" variant="primary" onPress={() => void remove($, pick)} />
                <Button key="rm-cancel" label="Keep" plain onPress={() => void update($, removing, () => '')} />
              </Box>
            ) : (
              <Box flexDirection="row" gap={2}>
                {pick.canToggle && <Button key={`t:${pick.kind}:${pick.id}`} label={pick.isOn ? 'Turn Off' : 'Turn On'}
                  variant={pick.isOn ? 'secondary' : 'primary'} onPress={() => void flip($, pick)} />}
                {pick.canToggle && <Button key={`rm:${pick.kind}:${pick.id}`} label="Remove…" plain
                  onPress={() => void update($, removing, () => `${pick.kind}:${pick.id}`)} />}
                <Button key="close-story" label="Done" plain onPress={() => void update($, selected, () => '')} />
              </Box>
            )}
          </Box>
        )}

        <Input key="discover" placeholder="Search skills, plugins and MCP servers" submitLabel="Search"
          onSubmit={(v: string) => void submit($, v)} />

        {!isSearching && !pl && charts && charts.length > 0 && (
          <Box flexDirection="column" gap={1}>
            <Text bold>Top Charts</Text>
            {charts.map((hit, i) => row(hit, i))}
          </Box>
        )}

        {isSearching && !pl && (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" gap={1}>
              <Text bold>{found!.length ? `Results for "${q}"` : `No results for "${q}"`}</Text>
              <Button key="hits-close" label="Cancel" plain onPress={() => void update($, hits, () => null)} />
            </Box>
            {found!.map(hit => row(hit))}
          </Box>
        )}

        {pl && (
          <Box flexDirection="column" borderStyle="round" borderColor={SEPARATOR} paddingX={1} gap={1}>
            {hasSvg && cover && (
              <Svg alt={`${label(pl.repo)} cover`} width={320} height={160} source={
                `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">` +
                `<defs><clipPath id="cv"><rect width="320" height="160" rx="12"/></clipPath></defs>` +
                `<image href="${cover}" width="320" height="160" clip-path="url(#cv)" preserveAspectRatio="xMidYMid slice"/></svg>`} />
            )}
            <Box flexDirection="row" gap={1} alignItems="center">
              {hasSvg && <Svg source={appIcon(listIcons.get(pl.repo), label(pl.repo), 56)} alt={label(pl.repo)} width={56} height={56} />}
              <Box flexDirection="column" flexGrow={1}>
                <Text bold>{label(pl.repo)}</Text>
                <Text color={SYS_GRAY}>{pl.repo.split('/')[0]} · {pl.kind === 'unknown' ? 'not installable here' : pl.kind}</Text>
                <Text color={SYS_GRAY}>★ {stars(pl.stars)} · Updated {pl.pushedAt} · {pl.license}</Text>
              </Box>
            </Box>
            {pl.description !== '' && <Text>{pl.description}</Text>}
            {pl.names.length > 0 && <Text color={SYS_GRAY}>Installs {pl.names.join(', ')} by running:</Text>}
            {pl.steps.map(s => <Text color={SYS_GRAY}>  {s.join(' ')}</Text>)}
            {pl.warnings.map(w => <Text color="#FF9F0A">⚠ {w}</Text>)}
            {pl.note !== '' && <Text color="#FF9F0A">{pl.note}</Text>}
            <Box flexDirection="row" gap={2}>
              {pl.steps.length > 0 && <Button key="install-go" label="Install" variant="primary" onPress={() => void confirm($)} />}
              <Button key="install-cancel" label="Cancel" plain onPress={() => void update($, plan, () => null)} />
            </Box>
          </Box>
        )}

        {status !== '' && <Text color={SYS_GRAY}>{status}</Text>}
        {inv.error && <Text color="#FF453A">{inv.error}</Text>}
        {isChanged && <Text color="#FF9F0A">Run /reload-plugins to apply (MCP servers: new session).</Text>}
      </Box>
    )
  })
}
