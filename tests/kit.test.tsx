import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Realistic sizes: a 40px avatar is ~4-10k characters as a data: URI. The pane must stay drawable
// (the engine refuses trees over 100,000 serialized characters) with many of them on screen.
const AVATAR = 'A'.repeat(6000)
const HOME = 'C:/Users/t'
const SURFACES = ['desktop', 'terminal'] as const
const slash = (path: string) => path.split('\\').join('/')

const searchResults = (q: string) => Array.from({ length: 15 }, (_, i) => ({
  fullName: i === 0 ? `lists/awesome-${q}` : `owner${i}/${q}-tool-${i}`, stargazersCount: 30000 - i * 1000,
  description: `A ${q} extension number ${i} for Claude Code`, updatedAt: '2026-09-30T00:00:00Z',
}))

// The world beneath the plugin: everything kit reads or runs, answered from memory.
const NOW = Date.parse('2026-10-04T12:00:00Z')
const DAY = 86_400_000

function world(on: On, calls: string[][] = [], store: Record<string, unknown> = {}, repoMeta: Record<string, unknown> = {}) {
  const v = (value: unknown) => ({ value }) as any
  mock.clock(on, { now: NOW })
  mock.store(on, store)
  on('tool.call', async (_$, e: any) => ({ result: { content: 'ok' } }) as any)
  mock.env(on, { USERPROFILE: HOME, OS: 'Windows_NT' })
  on('command.register', async () => v({}))
  on('ui.open', async () => v({}))
  on('ui.toast', async () => v(undefined))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => { const { Box } = ($.ui as any).resolve(e); return <Box key="engine-band" /> }) // the engine's own band: empty
  on('session.usage', async () => v({
    startedAt: 0, rateLimits: [],
    context: {
      window: 1_000_000,
      breakdown: {
        skills: { totalSkills: 3, includedSkills: 3, tokens: 1400, skillFrontmatter: [
          { name: 'ponytail', source: 'plugin', pluginName: 'ponytail', tokens: 906 },
          { name: 'graphify', source: 'user', tokens: 122 },
          { name: 'agent-reach', source: 'user', tokens: 312 },
        ] },
        mcpTools: [
          { name: 'search', serverName: 'context7', tokens: 400, isLoaded: false },
          { name: 'browse', serverName: 'Claude_Browser', tokens: 10800, isLoaded: true },
        ],
      },
    },
  }))
  on('http.fetch', async () => v({ ok: true, status: 200, text: '{}', headers: {} }))
  on('fs.write', async () => v(undefined))
  on('fs.exists', async (_$, e) => v(slash(e.path).includes('/avatars/'))) // avatars cached, nothing installed yet
  on('fs.list', async (_$, e) => v(slash(e.path).endsWith('/.claude/skills')
    ? [{ name: 'graphify', kind: 'dir' }, { name: 'agent-reach', kind: 'dir' }] : []))
  on('fs.read', async (_$, e: any) => {
    if (e.as === 'bytes') return v({ base64: AVATAR })
    if (slash(e.path).endsWith('/.claude.json')) return v(JSON.stringify({ mcpServers: { context7: {}, serena: {}, inventor: {}, headroom: {} } }))
    if (slash(e.path).endsWith('known_marketplaces.json')) return v(JSON.stringify({ ponytail: { source: { repo: 'DietrichGebert/ponytail' } } }))
    if (slash(e.path).endsWith('sources.json')) return v(JSON.stringify({ graphify: 'Graphify-Labs/graphify', 'agent-reach': 'Panniantong/Agent-Reach', context7: 'upstash/context7', serena: 'oraios/serena' }))
    if (slash(e.path).endsWith('plugin.json')) return v(JSON.stringify({ description: 'Lazy senior dev mode. Forces the simplest solution.' }))
    if (slash(e.path).endsWith('graphify/SKILL.md')) return v('---\nname: graphify\ndescription: "Turn any folder into a knowledge graph"\n---\n')
    if (slash(e.path).endsWith('agent-reach/SKILL.md')) return v('---\nname: agent-reach\ndescription: >\n  MUST USE to research\n  anything on the internet\n---\n')
    return { deny: `ENOENT ${e.path}` } as any
  })
  on('process.run', async (_$, e) => {
    const a = [...e.argv]
    calls.push(a)
    const ok = (stdout: string) => v({ exitCode: 0, stdout, stderr: '' })
    if (a[0] === 'claude' && a[1] === 'plugin' && a[2] === 'list')
      return ok(JSON.stringify([{ id: 'ponytail@ponytail', enabled: true, version: '4.10.0', installPath: `${HOME}/.claude/plugins/cache/ponytail` }]))
    if (a[0] === 'gh' && a[1] === 'search') {
      const topic = a.indexOf('--topic')
      const q = topic >= 0 ? (a[topic + 2].startsWith('--') ? 'top' : a[topic + 2]) : a[2].split(' ')[0]
      return ok(JSON.stringify(searchResults(q)))
    }
    if (a[0] === 'gh' && a[1] === 'api' && a[2] === 'graphql') return ok(JSON.stringify({ data: { repository: { usesCustomOpenGraphImage: false } } }))
    if (a[0] === 'gh' && a[1] === 'api' && a[2].includes('/git/trees/'))
      return ok(JSON.stringify({ tree: [{ path: '.claude-plugin/marketplace.json' }, { path: 'README.md' }] }))
    if (a[0] === 'gh' && a[2] === 'repos/DietrichGebert/ponytail/contents/.claude-plugin/marketplace.json')
      return ok(JSON.stringify({ name: 'ponytail', plugins: [{ name: 'ponytail', source: './' }] }))
    if (a[0] === 'gh' && a[2] === 'repos/DietrichGebert/ponytail/contents/.claude-plugin/plugin.json')
      return ok(JSON.stringify({ name: 'ponytail', version: (repoMeta as any).ponytailLatest ?? '4.10.3' }))
    if (a[0] === 'gh' && a[1] === 'api' && a[2].includes('/contents/'))
      return ok(JSON.stringify({ name: 'demo-market', plugins: [{ name: 'demo' }] }))
    if (a[0] === 'gh' && a[1] === 'api')
      return ok(JSON.stringify({ full_name: a[2].replace('repos/', ''), name: 'demo', default_branch: 'main',
        stargazers_count: 1234, pushed_at: '2026-09-30T00:00:00Z', license: { spdx_id: 'MIT' }, description: 'A demo plugin', ...repoMeta }))
    return ok('')
  })
}

const PANE = { plugin: 'kit', component: 'Pane', requestId: 'kit', props: {} as any } as const
const BAND = { plugin: 'kit', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100 } as any } as const

describe('kit pane', () => {
  for (const surface of SURFACES) {
    test(`${surface}: refresh lists installed items with descriptions`, async ($, on) => {
      world(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await expect(ui.drawn()).resolves.toBeDefined()
      for (const name of ['ponytail', 'graphify', 'agent-reach', 'context7', 'serena']) {
        expect(await ui.find({ text: name })).toBeDefined()
      }
      expect(await ui.find({ type: 'Text', text: /Lazy senior dev mode/ })).toBeDefined() // hover card in the tree
      expect(await ui.find({ type: 'Text', text: /research anything on the internet/ })).toBeDefined() // folded SKILL.md
    })

    test(`${surface}: Top Charts leaves out awesome-* lists`, async ($, on) => {
      world(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      expect(await ui.find({ text: /Top Charts/ })).toBeDefined()
      expect(await ui.find({ key: 'get:lists/awesome-top' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Button', text: 'Get' })).length).toBe(8)
    })

    test(`${surface}: a search with 15 results still draws (tree size budget)`, async ($, on) => {
      world(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.input({ key: 'discover', text: 'blender' })
      await expect(ui.drawn()).resolves.toBeDefined()
      expect(await ui.find({ text: /Results for "blender"/ })).toBeDefined()
      expect((await ui.findAll({ type: 'Button', text: 'Get' })).length).toBeGreaterThanOrEqual(15)
      expect(JSON.stringify(await ui.drawn()).length).toBeLessThan(100_000)
    })

    test(`${surface}: Get opens a confirm card and runs nothing`, async ($, on) => {
      const calls: string[][] = []
      world(on, calls)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.input({ key: 'discover', text: 'demo-org/demo' })
      expect(await ui.find({ text: /claude plugin marketplace add demo-org\/demo/ })).toBeDefined()
      expect(await ui.find({ key: 'install-go' })).toBeDefined()
      expect(calls.some(c => c[0] === 'claude' && c[2] === 'install')).toBe(false) // nothing installed before Install
      await ui.press({ key: 'install-cancel' })
      expect(await ui.find({ key: 'install-go' })).toBeUndefined()
    })

    test(`${surface}: Install runs exactly the shown steps, in order`, async ($, on) => {
      const calls: string[][] = []
      world(on, calls)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.input({ key: 'discover', text: 'demo-org/demo' })
      calls.length = 0
      await ui.press({ key: 'install-go' })
      const claudeCalls = calls.filter(c => c[0] === 'claude' && c[1] === 'plugin' && c[2] !== 'list').map(c => c.join(' '))
      expect(claudeCalls).toEqual(['claude plugin marketplace add demo-org/demo', 'claude plugin install demo@demo-market'])
      expect(await ui.find({ key: 'install-go' })).toBeUndefined() // card closes after success
    })

    test(`${surface}: Turn Off on a skill moves its folder aside (nothing deleted)`, async ($, on) => {
      const calls: string[][] = []
      world(on, calls)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.press({ key: 's:skill:graphify' })
      calls.length = 0
      await ui.press({ key: 't:skill:graphify' })
      const move = calls.find(c => c[0] === 'cmd' && c[2] === 'move')
      expect(slash(move?.[3] ?? '').endsWith('/.claude/skills/graphify')).toBe(true)
      expect(slash(move?.[4] ?? '').endsWith('/.claude/kit-off/skills/graphify')).toBe(true)
      const destructive = ['rm', 'rmdir', 'rd', 'del', 'erase', 'Remove-Item']
      expect(calls.some(c => c.some(arg => destructive.includes(arg)))).toBe(false)
    })

    test(`${surface}: pressing a story opens its card with the description`, async ($, on) => {
      world(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.press({ key: 's:skill:graphify' })
      expect(await ui.find({ key: 't:skill:graphify' })).toBeDefined()
      expect((await ui.findAll({ type: 'Text', text: /knowledge graph/ })).length).toBeGreaterThanOrEqual(2) // hover + card
    })
  }
})

describe('kit usage and safety', () => {
  for (const surface of SURFACES) {
    test(`${surface}: counts real MCP and Skill calls and shows them`, async ($, on) => {
      world(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await $.tool.call({ tool: 'mcp__serena__find_symbol', name_path: 'x' } as any)
      await $.tool.call({ tool: 'mcp__serena__find_symbol', name_path: 'y' } as any)
      await $.tool.call({ tool: 'Skill', skill: 'graphify' } as any)
      await $.tool.call({ tool: 'Skill', skill: 'ponytail:ponytail-review' } as any)
      await $.tool.call({ tool: 'Read', file_path: 'a' } as any) // not an extension: not counted
      await ui.press({ key: 'refresh' })
      await ui.press({ key: 's:mcp:serena' })
      expect(await ui.find({ type: 'Text', text: /Used 2× · last today/ })).toBeDefined()
      await ui.press({ key: 's:skill:graphify' })
      expect(await ui.find({ type: 'Text', text: /Used 1× · last today/ })).toBeDefined()
      expect((await ui.findAll({ type: 'Text', text: /Used 1×/ })).length).toBeGreaterThanOrEqual(2) // graphify + ponytail plugin
    })

    test(`${surface}: suggests turning off an active item idle for 14+ days`, async ($, on) => {
      world(on, [], { usage: { since: NOW - 30 * DAY, items: { 'skill:graphify': { count: 3, last: NOW - 20 * DAY } } } })
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.press({ key: 's:skill:graphify' })
      expect(await ui.find({ type: 'Text', text: /Idle for 14\+ days: turning it off frees ~122 tokens/ })).toBeDefined()
      await ui.press({ key: 's:skill:agent-reach' }) // never used, tracked 30 days, costs tokens
      expect(await ui.find({ type: 'Text', text: /Not used since kit started counting \(30d ago\)/ })).toBeDefined()
    })

    test(`${surface}: warns before installing an archived, stale, unlicensed repo`, async ($, on) => {
      world(on, [], {}, { archived: true, pushed_at: '2024-01-01T00:00:00Z', license: null })
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.input({ key: 'discover', text: 'demo-org/demo' })
      expect(await ui.find({ type: 'Text', text: /Archived by its owner/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /No commits for over a year/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /No license/ })).toBeDefined()
    })

    test(`${surface}: Remove asks first, then moves a skill to removed/ (no delete)`, async ($, on) => {
      const calls: string[][] = []
      world(on, calls)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.press({ key: 's:skill:graphify' })
      calls.length = 0
      await ui.press({ key: 'rm:skill:graphify' })
      expect(calls.length).toBe(0) // first press only asks
      expect(await ui.find({ key: 'rm-go:skill:graphify' })).toBeDefined()
      await ui.press({ key: 'rm-go:skill:graphify' })
      const move = calls.find(c => c[0] === 'cmd' && c[2] === 'move')
      expect(slash(move?.[4] ?? '')).toContain('/.claude/kit-off/removed/graphify-')
      const destructive = ['rm', 'rmdir', 'rd', 'del', 'erase', 'Remove-Item']
      expect(calls.some(c => c.some(arg => destructive.includes(arg)))).toBe(false)
    })

    test(`${surface}: flags a plugin update and applies it the Claude Code way`, async ($, on) => {
      const calls: string[][] = []
      world(on, calls)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      expect(await ui.find({ type: 'Text', text: /1 update/ })).toBeDefined()
      await ui.press({ key: 's:plugin:ponytail@ponytail' })
      expect(await ui.find({ type: 'Text', text: /Update available: 4\.10\.0 → 4\.10\.3/ })).toBeDefined()
      calls.length = 0
      await ui.press({ key: 'up:ponytail@ponytail' })
      const claudeCalls = calls.filter(c => c[0] === 'claude' && c[2] !== 'list').map(c => c.join(' '))
      expect(claudeCalls).toEqual(['claude plugin marketplace update ponytail', 'claude plugin update ponytail@ponytail'])
    })

    test(`${surface}: no update badge when the plugin is current`, async ($, on) => {
      world(on, [], {}, { ponytailLatest: '4.10.0' })
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      expect(await ui.find({ type: 'Text', text: /update/ })).toBeUndefined()
      await ui.press({ key: 's:plugin:ponytail@ponytail' })
      expect(await ui.find({ key: 'up:ponytail@ponytail' })).toBeUndefined()
    })

    test(`${surface}: Remove on a plugin uses Claude Code's own uninstall`, async ($, on) => {
      const calls: string[][] = []
      world(on, calls)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'refresh' })
      await ui.press({ key: 's:plugin:ponytail@ponytail' })
      await ui.press({ key: 'rm:plugin:ponytail@ponytail' })
      calls.length = 0
      await ui.press({ key: 'rm-go:plugin:ponytail@ponytail' })
      expect(calls.some(c => c.join(' ') === 'claude plugin uninstall ponytail@ponytail')).toBe(true)
    })
  }
})

describe('kit dock', () => {
  for (const surface of SURFACES) {
    test(`${surface}: draws the handle, icons and hover descriptions`, async ($, on) => {
      world(on)
      const pane = await $.ui.mount({ ...PANE, surface })
      await pane.press({ key: 'refresh' })
      const band = await $.ui.mount({ ...BAND, surface })
      await expect(band.drawn()).resolves.toBeDefined()
      expect(await band.find({ text: /kit · 3 active/ })).toBeDefined()
      expect(await band.find({ key: 'dock-open' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: /Lazy senior dev mode/ })).toBeDefined()
    })

    test(`${surface}: yields to a survey`, async ($, on) => {
      world(on)
      const pane = await $.ui.mount({ ...PANE, surface })
      await pane.press({ key: 'refresh' })
      const band = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, hasSurvey: true } })
      expect(await band.find({ key: 'dock-open' })).toBeUndefined()
    })
  }
})
