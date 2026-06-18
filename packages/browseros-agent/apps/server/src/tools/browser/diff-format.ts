import type { SnapshotDiff } from '../../browser/core/snapshot/diff'
import { wrapUntrusted } from './trust-boundary'

const MAX_INLINE_DIFF_WORDS = 2_000

export interface FormattedDiff {
  text: string
  structured?: Record<string, unknown>
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Formats observer diffs for direct tools and automatic post-action readback. */
export function formatDiffResult(
  diff: SnapshotDiff,
  origin: string,
  page: number,
): FormattedDiff {
  if (!diff.changed) return { text: 'no change since last snapshot' }

  const diffText = diff.text || '(empty page)'
  const wordCount = countWords(diffText)
  const structured = {
    added: diff.added,
    removed: diff.removed,
    ...(diff.urlChanged && {
      urlChanged: true,
      beforeUrl: diff.beforeUrl,
      afterUrl: diff.afterUrl,
    }),
  }

  if (wordCount > MAX_INLINE_DIFF_WORDS) {
    const text = diff.urlChanged
      ? `URL changed; full current snapshot is ${wordCount} words, over the ${MAX_INLINE_DIFF_WORDS}-word inline limit. Run snapshot on page ${page} for full details.`
      : `Diff is ${wordCount} words, over the ${MAX_INLINE_DIFF_WORDS}-word inline limit. Run snapshot on page ${page} for full details.`
    return {
      text,
      structured: {
        ...structured,
        truncated: true,
        wordCount,
      },
    }
  }

  if (diff.urlChanged) {
    return {
      text: `URL changed; returning full current snapshot instead of a diff:\n${wrapUntrusted(diffText, origin)}`,
      structured,
    }
  }

  return {
    text: wrapUntrusted(diff.text, origin),
    structured,
  }
}
