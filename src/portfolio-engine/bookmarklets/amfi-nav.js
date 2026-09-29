/*
  Xfina bookmarklet: AMFI NAV history (mutual fund and fund-of-fund schemes), made once and used again and again.

  Runs on amfiindia.com only, on the NAV History page, in the shared panel (core.js: modes, memory, windows,
  pacing, folder, states). For each scheme it does what a person does on that page: picks "Historical NAV for a
  period", the fund house, the scheme, the From and To dates, presses Go and, once the table has shown, presses the
  page's own Excel download. The files are AMFI's own (NAV_2026-01-01_to_2026-03-31.xlsx). AMFI names a file by its
  dates only, so when saving to a folder (Chrome, Edge) the scheme name is put in front, so files for different
  schemes don't overwrite each other; other browsers download under AMFI's name. Nothing is sent to Xfina.

  The page takes at most 5 years per download, so files are blocks of up to 5 financial years ending 31 March.
  AMFI's scheme names differ a little from the catalogue's, so each scheme is found by its base name, plan (direct
  or regular) and option (growth or IDCW); one that can't be found is skipped and its row says so.

  The fund house and scheme boxes are MUI autocompletes. Their button reads "Open" while the list is shut and
  "Close" while it shows, so a list left open has no "Open" button; the box is opened by whichever button is
  there, or by clicking the box itself. (The old stand-alone version looked only for "Open" and failed with
  "Cannot read properties of null (reading 'dispatchEvent')".)

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __SCHEMES__, JSON,
  [["ICICI Prudential Nifty 50 Index Fund - Direct Plan - Growth", "<label>", "2013-01-01"], ...]:
  the scheme's catalogue name, a label, the first date to ask for. Memory is keyed by the catalogue name, under the
  earlier stand-alone version's key (xfina.amfiNav.v1), so what a browser already fetched carries over.
  If the page changes, this is the one file to fix.
*/
(function () {
  XFINA_CORE;
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var dmy = function (d) { return ('0' + d.getDate()).slice(-2) + '-' + MON[d.getMonth()] + '-' + d.getFullYear(); };
  var put = function (el, d) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, iso(d));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  var tbl = function () { return Array.prototype.filter.call(document.querySelectorAll('table'), function (t) { return t.offsetParent; })[0]; };
  var newest = function () {
    var t = tbl();
    var top = null;
    if (!t) return null;
    Array.prototype.forEach.call(t.rows, function (r) {
      var c = r.cells[r.cells.length - 1];
      var m = c && c.textContent.trim().match(/^(\d\d)-([A-Za-z]{3})-(\d{4})$/);
      var d = m && new Date(+m[3], MON.indexOf(m[2]), +m[1]);
      if (d && (!top || d > top)) top = d;
    });
    return top;
  };
  var words = function (n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var baseOf = function (n) { return words(n).split(/ (?:regular|direct|growth|cumulative|idcw|dividend|option|plan)\b/)[0]; };
  var flags = function (n) { var w = words(n); return [/\bdirect\b/.test(w) ? 'd' : 'r', /\b(idcw|dividend)\b/.test(w) ? 'i' : /\b(growth|cumulative)\b/.test(w) ? 'g' : '']; };
  var opts = function () { return Array.prototype.slice.call(document.querySelectorAll('[role=option]')); };
  var combos = function () { return document.querySelectorAll('input[role=combobox]'); };
  var open = async function (inp, c) {
    var b = inp.parentElement.querySelector('button[aria-label=Open]');
    if (b) c.tap(b);
    else if (!inp.parentElement.querySelector('button[aria-label=Close]')) { inp.focus(); c.tap(inp); }
    await c.pause(400);
    if (!(await c.wait(function () { return opts().length > 1; }, 15000))) throw new Error('the list didn\'t open');
  };
  var shut = async function (inp, c) {
    if (!inp.parentElement.querySelector('button[aria-label=Close]')) return;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await c.pause(300);
  };
  var best = function (name) {
    var b = baseOf(name);
    var f = flags(name);
    var cands = opts().filter(function (o) { return baseOf(o.textContent) === b && flags(o.textContent)[0] === f[0]; });
    var exact = cands.filter(function (o) { return !f[1] || flags(o.textContent)[1] === f[1]; });
    var hit = exact.length ? exact : cands.filter(function (o) { return !flags(o.textContent)[1]; });
    hit.sort(function (x, y) { return x.textContent.length - y.textContent.length; });
    return hit[0];
  };
  var amcFor = function (name) {
    var b = baseOf(name);
    var list = opts().filter(function (o) { var a = words(o.textContent).replace(/ mutual fund$/, ''); return a && (b === a || b.indexOf(a + ' ') === 0); });
    list.sort(function (x, y) { return y.textContent.length - x.textContent.length; });
    if (list[0]) return list[0];
    return opts().filter(function (o) { return words(o.textContent).split(' ')[0] === b.split(' ')[0]; })[0];
  };
  var amc = '';
  var sn = '';

  xfinaPanel({
    title: 'AMFI NAV',
    key: 'xfina.amfiNav.v1',
    url: 'https://www.amfiindia.com/net-asset-value/nav-history',
    page: 'NAV History',
    ready: function () { return !!document.querySelector('input[type=radio][value=historical-nav-for-a-period]'); },
    years: 5,
    items: JSON.parse('__SCHEMES__').map(function (x) { return { id: x[0], code: x[1], name: x[1], from: x[2] }; }),
    prepare: async function (it, c) {
      var radio = await c.look('input[type=radio][value=historical-nav-for-a-period]', 'the Historical NAV for a period option');
      if (!radio.checked) { radio.click(); await c.pause(1200); amc = ''; }
      var c1 = await c.look(combos()[0], 'the fund house box');
      await open(c1, c);
      var ao = amcFor(it.id);
      if (!ao) { await shut(c1, c); c.skip('fund house not found on AMFI'); }
      var an = ao.textContent.trim();
      if (an !== amc) { c.tap(ao); amc = an; await c.pause(1500); } else await shut(c1, c);
      var c2 = await c.look(combos()[1], 'the scheme box');
      await open(c2, c);
      var so = best(it.id);
      if (!so) { await shut(c2, c); c.skip('scheme not found on AMFI'); }
      sn = so.textContent.trim();
      c.tap(so);
      await c.pause(900);
    },
    fetch: async function (it, w, c) {
      var ds = document.querySelectorAll('input[type=date]');
      put(await c.look(ds[0], 'the From date'), w[0]);
      put(await c.look(ds[1], 'the To date'), w[1]);
      await c.nap();
      var go = Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return b.textContent.trim() === 'Go'; })[0];
      (await c.look(go, 'the Go button')).click();
      var want = 'From ' + dmy(w[0]) + ' to ' + dmy(w[1]);
      var got = await c.wait(function () { var t = document.body.innerText; return tbl() && t.indexOf(want) >= 0 && t.indexOf(sn) >= 0; }, 25000);
      if (!got) return null;
      await c.pause(700);
      var e = newest();
      if (!e) return null;
      await c.nap();
      var ex = await c.look('button[aria-label="Download Excel"]', 'the Excel download button');
      await c.grab(function () { ex.click(); }, 'NAV_' + iso(w[0]) + '_to_' + iso(w[1]) + '.xlsx', sn);
      return e;
    }
  });
})();
