// Turns a bookmarklet source file into a `javascript:` URL that can be dragged to the bookmarks bar.
// The source files are plain readable scripts; this only strips comments and whitespace.
export function bookmarkletHref(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join(' ');
  return `javascript:${encodeURIComponent(code)}`;
}
