import type { SnapshotDiff } from '../../browser/core/snapshot/diff'
import { writeTempToolOutputFile } from './output-file'
import { wrapUntrusted } from './trust-boundary'

const MAX_INLINE_DIFF_WORDS = 2_000
const MAX_SAVE_FAILURE_EXCERPT_CHARS = 4_000

export interface FormattedDiff {
  text: string
  structured?: Record<string, unknown>
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Formats observer diffs for direct tools and automatic post-action readback. */
export async function formatDiffResult(
  diff: SnapshotDiff,
  origin: string,
): Promise<FormattedDiff> {
  if (!diff.changed) return { text: 'no change since last snapshot' }

  const diffText = diff.text || '(empty page)'
  const wordCount = countWords(diffText)
  const wrappedDiff = wrapUntrusted(diffText, origin)
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
    try {
      const path = await writeTempToolOutputFile({
        toolName: 'diff',
        extension: 'md',
        content: wrappedDiff,
      })
      const text = diff.urlChanged
        ? `URL changed; full current snapshot is ${wordCount} words, over the ${MAX_INLINE_DIFF_WORDS}-word inline limit, saved to: ${path}\nRead the file for the full current snapshot.`
        : `Diff is ${wordCount} words, over the ${MAX_INLINE_DIFF_WORDS}-word inline limit, saved to: ${path}\nRead the file for the full diff.`
      return {
        text,
        structured: {
          ...structured,
          truncated: true,
          wordCount,
          path,
          contentLength: wrappedDiff.length,
          writtenToFile: true,
        },
      }
    } catch (error) {
      const saveError = error instanceof Error ? error.message : String(error)
      const excerpt = diffText.slice(0, MAX_SAVE_FAILURE_EXCERPT_CHARS)
      const text = diff.urlChanged
        ? `URL changed; full current snapshot is ${wordCount} words, over the ${MAX_INLINE_DIFF_WORDS}-word inline limit, but saving it to a BrowserOS output file failed: ${saveError}`
        : `Diff is ${wordCount} words, over the ${MAX_INLINE_DIFF_WORDS}-word inline limit, but saving it to a BrowserOS output file failed: ${saveError}`
      return {
        text: [
          text,
          `Showing the first ${excerpt.length} chars instead:`,
          wrapUntrusted(excerpt, origin),
        ].join('\n'),
        structured: {
          ...structured,
          truncated: true,
          wordCount,
          contentLength: wrappedDiff.length,
          writtenToFile: false,
          outputWriteFailed: true,
          error: saveError,
        },
      }
    }
  }

  if (diff.urlChanged) {
    return {
      text: `URL changed; returning full current snapshot instead of a diff:\n${wrappedDiff}`,
      structured,
    }
  }

  return {
    text: wrappedDiff,
    structured,
  }
}
