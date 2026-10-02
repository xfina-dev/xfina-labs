/*
  Xfina bookmarklet: NSE Indices, Total Returns Index history. Made once, used again and again.

  Runs on niftyindices.com only, on Historical Data Reports, in the shared panel (core.js: modes, memory, windows,
  pacing, folder, states). For each index it does what a person does on that page: picks the report, the Index Type,
  the Sub-Index and the index, sets a date range, presses Submit, then the page's own "csv format". The files are
  the ones the page produces, named by the page, exactly as a manual download. Nothing is sent to Xfina.

  Equity indexes are taken from Total returns Index Values. Debt indexes are not offered there, so they are taken
  from Historical Index Data (Fixed Income): the same steps on that form, and NSE's own file for it (named
  ..._Historical_PR_..., the index level: Date, Open, High, Low, Close), which NSE says is already total return for
  these. Indexes are taken in report / type / group order, so each form is set up once.

  The page takes one year per request (a longer range fetches nothing, with no error), so files are one financial
  year each (April to March). It reports an empty range with an alert(); that window is passed over, not failed.
  "csv format" is a link whose address is the CSV itself (a data: URL): with a folder, its handler is run and the
  file written from that address; otherwise the link is clicked and the browser downloads it.

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __INDEXES__, JSON,
  [["NIFTY 50", "Nifty 50", "1999-06-30"], ...] for equity, or [page name, label, first date, "h", "Fixed Income",
  group] for debt: the page's dropdown name, a label, the date the index starts. Memory is keyed by the page's name,
  under the earlier stand-alone version's key (xfina.nseIndices.v2), so what a browser already fetched carries over.
  If the page changes, this is the one file to fix.
*/
(function () {
  XFINA_CORE;
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var SEC = {
    t: { li: 'li.form5', ty: '#ddlHistoricalreturntypee', su: '#ddlHistoricalreturntypeeSubindex', ix: '#ddlHistoricalreturntypeeindex', from: '#datepickerFromtotalindex', to: '#datepickerTototalindex', go: '#submit_totalindexhistorical', ex: '#exportTotalindex', rows: '#historytotalindex tr' },
    h: { li: 'li.form1', ty: '#ddlHistoricaltypee', su: '#ddlHistoricaltypeeSubindex', ix: '#ddlHistoricaltypeeindex', from: '#datepickerFrom', to: '#datepickerTo', go: '#submit_button', ex: '#exporthistorical', rows: '#history tr' }
  };
  var cur = SEC.t;
  var at = '';
  var put = function (sel, d) {
    var el = $(sel);
    el.datepicker('setDate', d);
    var f = el.datepicker('option', 'onSelect');
    if (f) f.call(el[0]);
  };
  // The date inputs are invisible (opacity 0) under the page's own date display, so that box is what gets outlined.
  var shown = function (sel) { var el = document.querySelector(sel); return el && el.closest('.dateHolder') || el; };
  var rows = function () { return document.querySelectorAll(cur.rows); };
  var first = function () { var r = rows(); return r.length > 1 ? r[1].textContent : ''; };
  var newest = function () {
    var r = rows();
    var c = r.length > 1 && r[1].children[0];
    if (!c) return null;
    var p = c.textContent.trim().split(' ');
    var d = new Date(+p[2], MON.indexOf(p[1]), +p[0]);
    return isNaN(d) ? null : d;
  };
  var X = JSON.parse('__INDEXES__').map(function (x, i) { return { id: x[0], code: x[1], name: x[1], from: x[2], k: x[3] || 't', ty: x[4] || 'Equity', g: x[5] || 'Broad Market Indices', i: i }; });
  X.sort(function (a, b) { var p = a.k + a.ty + a.g, q = b.k + b.ty + b.g; return p < q ? -1 : p > q ? 1 : a.i - b.i; });

  xfinaPanel({
    title: 'NSE Indices',
    key: 'xfina.nseIndices.v2',
    url: 'https://www.niftyindices.com/reports/historical-data',
    page: 'Historical Data Reports',
    ready: function () { return typeof $ === 'function' && $.fn && $.fn.datepicker && !!document.querySelector('li.form5'); },
    years: 1,
    items: X,
    prepare: async function (it, c) {
      cur = SEC[it.k];
      if (at !== it.k + it.ty + it.g) {
        var menu = document.querySelector('a.btn-select');
        if (menu && !menu.classList.contains('active')) { c.tap(await c.look(menu, 'the report list')); await c.pause(700); }
        c.tap(await c.look(cur.li, 'the ' + (it.k === 't' ? 'Total returns Index Values' : 'Historical Index Data') + ' report'));
        await c.pause(800);
        await c.look(cur.ty, 'the Index Type list');
        $(cur.ty).val(it.ty).trigger('change');
        if (!(await c.wait(function () { return $(cur.su + ' option').length > 1; }, 10000))) throw new Error('the page didn\'t list the Sub-Index groups');
        await c.look(cur.su, 'the Sub-Index list');
        $(cur.su).val(it.g).trigger('change');
        if (!(await c.wait(function () { return $(cur.ix + ' option').length > 1; }, 10000))) throw new Error('the page didn\'t list the indexes');
        at = it.k + it.ty + it.g;
      }
      if (!$(cur.ix + ' option').filter(function () { return this.value === it.id; }).length) c.skip('not on the page');
      await c.look(cur.ix, 'the index list');
      $(cur.ix).val(it.id).trigger('change');
      await c.pause(800);
    },
    fetch: async function (it, w, c) {
      var before = first();
      await c.look(shown(cur.from), 'the From date');
      put(cur.from, w[0]);
      await c.look(shown(cur.to), 'the To date');
      put(cur.to, w[1]);
      await c.nap();
      c.alerts();
      (await c.look(cur.go, 'the Submit button')).click();
      var got = await c.wait(function () { return c.peek() || (first() && first() !== before); }, 20000);
      var al = c.alerts();
      if (al.length) { if (/no\s*(data|record)/i.test(al[0])) return null; throw new Error('the page said: ' + al[0]); }
      if (!got) return null;
      await c.nap();
      var ex = await c.look(cur.ex, 'the csv format link');
      if (c.folder()) {
        $(ex).triggerHandler('click');
        await c.save(ex.download, decodeURIComponent(ex.href.slice(ex.href.indexOf(',') + 1)));
      } else ex.click();
      return newest() || w[1];
    }
  });
})();
