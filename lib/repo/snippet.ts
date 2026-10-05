export function makeSnippet(body: string, index: number, len: number) {
  const start = Math.max(0, index - 20);
  const end = Math.min(body.length, index + len + 40);
  return (start > 0 ? '…' : '') + body.slice(start, end).replace(/\s+/g, ' ') + (end < body.length ? '…' : '');
}
