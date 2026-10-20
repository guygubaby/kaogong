import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === 'string' &&
            src.startsWith('/api/knowledge/assets/') ? (
              <img
                src={src}
                alt={alt || '知识库配图'}
                loading="lazy"
                className={alt === '公式' ? 'formula-image' : 'knowledge-image'}
              />
            ) : (
              <span className="text-muted-foreground">[图片未收录]</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
