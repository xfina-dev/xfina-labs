// Downloads for the Results: a table as CSV, a result as JSON, and a chart as PNG.

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const cell = (v) => (v === null || v === undefined ? '' : /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
// rows: [header, ...rows], each an array of cells.
export function downloadCsv(filename, rows) {
  download(new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }), filename);
}

export function downloadJson(filename, data) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

// A chart as PNG, as it shows on screen: every chart SVG inside `root`, with its colours and fonts written in,
// and the HTML around it (headings, legends and their swatches) drawn in place. Cropped to what is drawn, on
// the card's background, at twice the screen size, with a title line above.
const SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight'];
function svgImage(svg) {
  const clone = svg.cloneNode(true);
  const from = [svg, ...svg.querySelectorAll('*')], to = [clone, ...clone.querySelectorAll('*')];
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    to[i].setAttribute('style', SVG_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
  const r = svg.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', r.width);
  clone.setAttribute('height', r.height);
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok({ img, r });
    img.onerror = fail;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  });
}

export async function downloadPng(root, filename, title) {
  const svgs = [...root.querySelectorAll('svg[role="img"]')];
  const texts = [], swatches = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    // Not the SVGs' own text, nor legend entries switched off or controls marked to leave out
    const el = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
    if (el?.closest('svg, [aria-pressed="false"], [data-export-skip]')) continue;
    if (n.nodeType === Node.TEXT_NODE) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      const cs = getComputedStyle(n.parentElement), text = n.textContent.trim();
      if (r.width) texts.push({ text: cs.textTransform === 'uppercase' ? text.toUpperCase() : text, r, cs });
    } else if (n.tagName === 'I') {
      const r = n.getBoundingClientRect();
      if (r.width) swatches.push({ r, color: getComputedStyle(n).backgroundColor });
    }
  }
  const images = await Promise.all(svgs.map(svgImage));
  const rects = [...images.map((x) => x.r), ...texts.map((x) => x.r), ...swatches.map((x) => x.r)];
  const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right)), bottom = Math.max(...rects.map((r) => r.bottom));
  const PAD = 20, HEAD = title ? 30 : 0, SCALE = 2;
  const card = root.closest('[class*="shadow-sm"]') || root;
  const canvas = Object.assign(document.createElement('canvas'), { width: (right - left + PAD * 2) * SCALE, height: (bottom - top + PAD * 2 + HEAD) * SCALE });
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = getComputedStyle(card).backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const x = (r) => r.left - left + PAD, y = (r) => r.top - top + PAD + HEAD;
  const rootStyle = getComputedStyle(root);
  if (title) {
    ctx.font = `600 13px ${rootStyle.fontFamily}`;
    ctx.fillStyle = rootStyle.color;
    ctx.textBaseline = 'top';
    ctx.fillText(title, PAD, PAD);
  }
  for (const { img, r } of images) ctx.drawImage(img, x(r), y(r), r.width, r.height);
  for (const { r, color } of swatches) { ctx.fillStyle = color; ctx.fillRect(x(r), y(r), r.width, r.height); }
  ctx.textBaseline = 'top';
  for (const { text, r, cs } of texts) {
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    ctx.fillText(text, x(r), y(r) + (r.height - parseFloat(cs.fontSize)) / 2);
  }
  await new Promise((ok) => canvas.toBlob((b) => { download(b, filename); ok(); }, 'image/png'));
}
