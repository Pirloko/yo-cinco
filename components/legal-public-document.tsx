import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

import { loadLegalMarkdown, type LegalDocumentId } from '@/lib/legal-markdown'

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="font-[family-name:var(--font-brand)] text-3xl font-semibold tracking-tight text-foreground">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 border-t border-border pt-8 text-xl font-semibold text-foreground first:mt-0 first:border-0 first:pt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-base font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:text-primary/90"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-8 border-border" />,
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[280px] text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border bg-secondary/50 text-foreground">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-muted-foreground align-top">{children}</td>
  ),
}

type LegalPublicDocumentProps = {
  documentId: LegalDocumentId
  pageTitle: string
  otherPage?: { href: string; label: string }
}

export async function LegalPublicDocument({
  documentId,
  pageTitle,
  otherPage,
}: LegalPublicDocumentProps) {
  const markdown = await loadLegalMarkdown(documentId)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← SPORTMATCH
          </Link>
          {otherPage ? (
            <Link
              href={otherPage.href}
              className="text-sm text-primary hover:text-primary/90"
            >
              {otherPage.label}
            </Link>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 pb-16">
        <p className="sr-only">{pageTitle}</p>
        <article>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {markdown}
          </ReactMarkdown>
        </article>

        <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            Documento público de SportMatch. No requiere iniciar sesión. Última
            versión publicada en{' '}
            <span className="text-foreground">www.sportmatch.cl</span>.
          </p>
          {otherPage ? (
            <p className="mt-2">
              <Link href={otherPage.href} className="text-primary underline underline-offset-2">
                {otherPage.label}
              </Link>
            </p>
          ) : null}
        </footer>
      </main>
    </div>
  )
}
