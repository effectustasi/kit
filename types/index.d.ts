export type Kind = 'plugin' | 'skill' | 'mcp'

export type Row = {
  kind: Kind
  /** plugin id (name@marketplace), skill folder name, or MCP server name */
  id: string
  name: string
  isOn: boolean
  /** listed in this chat's context right now */
  isLoaded: boolean
  /** always-on context tokens this item costs in this chat (0 when not loaded) */
  tokens: number
  /** false for items kit cannot switch (project-scoped MCP, bundled skills) */
  canToggle: boolean
  /** GitHub owner/repo it came from, when known */
  repo?: string
  /** data: URI of the owner's GitHub avatar, for the story ring */
  avatar?: string
  /** what it does: plugin.json / SKILL.md description, or the GitHub repo description */
  about?: string
  /** times Claude used it (Skill tool calls, MCP tool calls) since kit started counting */
  uses?: number
  /** epoch ms of the last use */
  lastUsed?: number
  /** plugins: installed version, and the newest one its marketplace publishes */
  version?: string
  latest?: string
}

/** Usage counts kit keeps in $.store across sessions, keyed `skill:x`, `plugin:x`, `mcp:x`. */
export type Usage = { since: number; items: Record<string, { count: number; last: number }> }

export type Inventory = {
  rows: Row[]
  tokens: number
  window: number
  error?: string
}

/** What installing a GitHub repo would do, shown for confirmation before anything runs. */
export type Plan = {
  repo: string
  kind: Kind | 'unknown'
  names: string[]
  stars: number
  pushedAt: string
  license: string
  description: string
  /** argv lists run in order on Install; a `copy:` step copies a cloned skill folder */
  steps: string[][]
  note: string
  /** data: URI of the repo's own social preview (only when the owner uploaded one), shown as a cover */
  banner?: string
  /** trust signals worth a second look before installing: archived, stale, no license */
  warnings: string[]
}

/** One GitHub search result in the Discover list. */
export type Hit = {
  repo: string
  stars: number
  description: string
  updatedAt: string
  avatar?: string
}

declare module 'claude-code' {
  interface PluginState {
    skilldock: { inventory: Inventory; busy: string; changed: boolean; plan: Plan | null; selected: string; hits: Hit[] | null; query: string; top: Hit[] | null; removing: string; usageSince: number }
  }
}
