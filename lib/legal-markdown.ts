import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DEV_NOTE_HEADING = '## Nota para desarrollo'

export type LegalDocumentId = 'privacy' | 'terms'

const FILE_BY_ID: Record<LegalDocumentId, string> = {
  privacy: 'politicas-de-privacidad.md',
  terms: 'terminos-de-uso.md',
}

/** Quita la sección interna de desarrollo al final de los .md legales. */
export function stripLegalDevSection(markdown: string): string {
  const idx = markdown.indexOf(DEV_NOTE_HEADING)
  return (idx >= 0 ? markdown.slice(0, idx) : markdown).trimEnd()
}

export async function loadLegalMarkdown(id: LegalDocumentId): Promise<string> {
  const filePath = path.join(process.cwd(), FILE_BY_ID[id])
  const raw = await readFile(filePath, 'utf8')
  return stripLegalDevSection(raw)
}
