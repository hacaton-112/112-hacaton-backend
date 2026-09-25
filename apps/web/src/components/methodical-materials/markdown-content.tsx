import ReactMarkdown from "react-markdown";

export function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="min-w-0 text-sm leading-6 text-(--gray-12)">
      <ReactMarkdown
        skipHtml
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 text-xl font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 mb-2 text-lg font-bold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-2 font-bold">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-3 grid list-disc gap-1 pl-6">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 grid list-decimal gap-1 pl-6">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-r-(--radius-3) border-l-4 border-(--accent-a7) bg-(--accent-a2) px-4 py-2 text-(--gray-11)">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-(--gray-a3) px-1 py-0.5 font-mono text-xs">
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a
              className="text-(--accent-11) underline underline-offset-2"
              href={href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
