export function learningContent(text: string) {
  return text
    .replace(
      /^[\t >]*(?:[-*] )?(?:\*\*)?(?:资料来源|文章来源|原文链接|原始链接|来源|出处|source)(?:\*\*)?\s*[:：][^\n]*(?:\n|$)/gim,
      '',
    )
    .replace(
      /\[([^\]]*)\]\(([^\s)]*saduck[^\s)]*)\)/gi,
      (_match, label: string) => (/saduck/i.test(label) ? '' : label),
    )
    .replace(/https?:\/\/[^\s<>"')\]]*saduck[^\s<>"')\]]*/gi, '')
    .replace(/saduck\s*[-—·]?\s*/gi, '')
}
