export const excludedKnowledgePaths = new Set([
  'lectures/PrivacyPolicy.md',
  'lectures/UserAgreement.md',
  'lectures/contact.md',
  'skill/references/knowledge/其他资料.md',
])

export const studyDocumentsSql = `path NOT IN (${[...excludedKnowledgePaths].map((path) => `'${path.replaceAll("'", "''")}'`).join(',')})`
