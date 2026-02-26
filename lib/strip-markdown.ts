// Strip markdown/HTML formatting to plain text for card excerpts
export function stripMarkdown(text: string, maxLength = 120): string {
  if (!text) return ''
  const plain = text
    .replace(/#{1,6}\s+/g, '')           // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')     // bold
    .replace(/\*(.+?)\*/g, '$1')         // italic
    .replace(/__(.+?)__/g, '$1')         // bold alt
    .replace(/_(.+?)_/g, '$1')           // italic alt
    .replace(/~~(.+?)~~/g, '$1')         // strikethrough
    .replace(/`{1,3}[^`]*`{1,3}/g, '')  // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/^[-*+]\s+/gm, '')          // list bullets
    .replace(/^\d+\.\s+/gm, '')          // numbered lists
    .replace(/^>\s+/gm, '')              // blockquotes
    .replace(/<[^>]+>/g, '')             // HTML tags
    .replace(/\n+/g, ' ')               // newlines → space
    .trim()
  return plain.length > maxLength ? plain.slice(0, maxLength) + '\u2026' : plain
}
