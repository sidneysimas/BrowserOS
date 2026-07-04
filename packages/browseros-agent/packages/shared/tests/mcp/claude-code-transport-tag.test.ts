/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureClaudeCodeHttpTransportTag } from '@browseros/shared/mcp/claude-code-transport-tag'

async function withTempConfig<T>(
  run: (path: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-transport-tag-'))
  try {
    return await run(join(dir, '.claude.json'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('ensureClaudeCodeHttpTransportTag', () => {
  it('surgically adds type http to the requested claude-code entry', async () => {
    await withTempConfig(async (configPath) => {
      const before = `{
  "theme": "dark",
  "mcpServers": {
    "other": {
      "command": "node"
    },
    "browseros": {
      "url": "http://127.0.0.1:9100/mcp"
    }
  },
  "history": ["keep"]
}
`
      const expected = `{
  "theme": "dark",
  "mcpServers": {
    "other": {
      "command": "node"
    },
    "browseros": {
      "url": "http://127.0.0.1:9100/mcp",
      "type": "http"
    }
  },
  "history": ["keep"]
}
`
      await writeFile(configPath, before, 'utf8')

      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'browseros',
        }),
      ).resolves.toBe(true)

      const after = await readFile(configPath, 'utf8')
      expect(after).toBe(expected)
      expect(JSON.parse(after)).toEqual({
        theme: 'dark',
        mcpServers: {
          other: { command: 'node' },
          browseros: {
            url: 'http://127.0.0.1:9100/mcp',
            type: 'http',
          },
        },
        history: ['keep'],
      })

      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'browseros',
        }),
      ).resolves.toBe(false)
      await expect(readFile(configPath, 'utf8')).resolves.toBe(expected)
    })
  })

  it('overwrites an existing non-http type for the requested entry', async () => {
    await withTempConfig(async (configPath) => {
      const before = `{
  "mcpServers": {
    "profile-one": {
      "type": "sse",
      "url": "http://127.0.0.1:9200/mcp"
    }
  }
}
`
      const expected = `{
  "mcpServers": {
    "profile-one": {
      "type": "http",
      "url": "http://127.0.0.1:9200/mcp"
    }
  }
}
`
      await writeFile(configPath, before, 'utf8')

      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'profile-one',
        }),
      ).resolves.toBe(true)
      await expect(readFile(configPath, 'utf8')).resolves.toBe(expected)
    })
  })

  it('requires the expected URL when one is supplied', async () => {
    await withTempConfig(async (configPath) => {
      const before = `{
  "mcpServers": {
    "browseros": {
      "url": "http://127.0.0.1:9200/mcp"
    }
  }
}
`
      const expected = `{
  "mcpServers": {
    "browseros": {
      "url": "http://127.0.0.1:9200/mcp",
      "type": "http"
    }
  }
}
`
      await writeFile(configPath, before, 'utf8')

      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'browseros',
          expectedUrl: 'http://127.0.0.1:9300/mcp',
        }),
      ).resolves.toBe(false)
      await expect(readFile(configPath, 'utf8')).resolves.toBe(before)

      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'browseros',
          expectedUrl: 'http://127.0.0.1:9200/mcp',
        }),
      ).resolves.toBe(true)
      await expect(readFile(configPath, 'utf8')).resolves.toBe(expected)
    })
  })

  it('preserves unrelated keys and surrounding formatting outside the entry', async () => {
    await withTempConfig(async (configPath) => {
      const before = `{
    "before": {
      "nested": true
    },
    "mcpServers": {
      "browseros": {
        "url": "http://127.0.0.1:9200/mcp"
      }
    },
    "after": [
      "unchanged"
    ]
  }
`
      await writeFile(configPath, before, 'utf8')

      await ensureClaudeCodeHttpTransportTag({
        configPath,
        serverName: 'browseros',
      })

      const after = await readFile(configPath, 'utf8')
      expect(after).toStartWith(`{
    "before": {
      "nested": true
    },
    "mcpServers": {`)
      expect(after).toEndWith(`,
    "after": [
      "unchanged"
    ]
  }
`)
    })
  })

  it('no-ops when the requested entry is missing', async () => {
    await withTempConfig(async (configPath) => {
      const source = `{
  "mcpServers": {
    "other": {
      "url": "http://127.0.0.1:9100/mcp"
    }
  }
}
`
      await writeFile(configPath, source, 'utf8')

      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'browseros',
        }),
      ).resolves.toBe(false)
      await expect(readFile(configPath, 'utf8')).resolves.toBe(source)
    })
  })

  it('no-ops when the config file is missing', async () => {
    await withTempConfig(async (configPath) => {
      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'browseros',
        }),
      ).resolves.toBe(false)
    })
  })

  it('no-ops when the config file is invalid JSON', async () => {
    await withTempConfig(async (configPath) => {
      const source = '{"mcpServers":'
      await writeFile(configPath, source, 'utf8')

      await expect(
        ensureClaudeCodeHttpTransportTag({
          configPath,
          serverName: 'browseros',
        }),
      ).resolves.toBe(false)
      await expect(readFile(configPath, 'utf8')).resolves.toBe(source)
    })
  })
})
