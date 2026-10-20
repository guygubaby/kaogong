import { posix } from 'node:path'
import { excludedKnowledgePaths } from '../src/lib/knowledge-scope'

export function rewriteKnowledgeLinks(
  body: string,
  path: string,
  ids: ReadonlyMap<string, string>,
) {
  return body.replace(
    /(?<!!)\[([^\]]+)\]\((?:<([^>]+)>|([^\s)]+))\)/g,
    (match, label: string, angleTarget?: string, plainTarget?: string) => {
      const target = angleTarget ?? plainTarget ?? ''
      if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(target)) return match
      let file = target.split('#')[0]
      try {
        file = decodeURIComponent(file)
      } catch {
        /* 保留文件名中的非编码百分号。 */
      }
      const logical = posix
        .normalize(posix.join(posix.dirname(path), file))
        .replace(/^skill\/references\/pages\//, 'lectures/')
        .replace(/^skill\/references\/zhenti\//, 'questions/')
      if (excludedKnowledgePaths.has(logical)) return label
      const id = ids.get(logical)
      return id ? `[${label}](/learn/library?doc=${id})` : match
    },
  )
}
