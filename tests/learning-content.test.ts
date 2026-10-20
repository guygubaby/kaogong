import { expect, it } from 'vitest'
import { learningContent } from '../src/lib/learning-content'

it('移除资料署名与外站入口，同时保留考点正文、公式和学习导航', () => {
  const result = learningContent(
    [
      '# 申论要素',
      '> 来源: https://saduck.top/申论.html',
      '**出处**：外站资料',
      '## SaDuck - 公考知识库',
      '[查看讲义](https://www.saduck.top/a) [SaDuck](https://saduck.top)',
      'https://saduck.top/a?q=1',
      '原因是问题产生的来源。',
      '![公式](/api/knowledge/assets/abc)',
      '[练习](/learn/library?doc=abc)',
    ].join('\n'),
  )
  expect(result).not.toMatch(/saduck|来源[:：]|出处/iu)
  expect(result).toContain('原因是问题产生的来源。')
  expect(result).toContain('## 公考知识库')
  expect(result).toContain('[练习](/learn/library?doc=abc)')
  expect(result).toContain('![公式](/api/knowledge/assets/abc)')
})
