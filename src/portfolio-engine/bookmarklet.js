// Turns a bookmarklet source file into a `javascript:` URL that can be dragged to the bookmarks bar.
// The source files are plain readable scripts; this only fills in their parameters and strips comments
// and whitespace. `params` replaces __NAME__ tokens with JSON text, so a bookmark can be generated for
// exactly the datasets the user picked.
export function bookmarkletHref(source, params = {}) {
  let src = source;
  for (const [key, value] of Object.entries(params)) {
    // The value lands inside a single-quoted JS string, so escape backslashes and quotes.
    const json = JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    src = src.split(`__${key}__`).join(json);
  }
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join(' ');
  return `javascript:${encodeURIComponent(code)}`;
}
