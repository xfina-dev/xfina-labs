/*
  Xfina bookmarklet: NSE ETF price history (Security-wise Archives), made once and used again and again.

  Runs on nseindia.com only, on the Security-wise Archives page, in the shared panel (core.js: modes, memory,
  windows, pacing, folder, states). For each ETF it does what a person does on that page: types the symbol and
  picks it, picks the EQ series, chooses Custom dates, presses GO and, once the table has shown, presses the page's
  own "Download (.csv)". The files are NSE's own, named by NSE (for example
  01-04-2025-TO-31-03-2026-NIFTYBEES-EQ-N.csv): price and volume with deliverable position per trading day.
  The page takes up to 5 years per request (checked live: 5 years returns every trading day in one CSV; a longer
  range fetches nothing, with no error), so a longer range is one file per 5 financial years.

  NSE's Terms of Use restrict automated data collection. This only saves the clicking on the same page and the same
  button, one file at a time, at a human pace, but the reader should know what the terms say and decide for themselves.

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __SYMBOLS__, JSON,
  [["NIFTYBEES", "Nippon India ETF Nifty 50 BeES", "2002-01-08"], ...]: the NSE symbol, a label, the first date to ask for.
  The memory key (xfina.nseEtf.v1, keyed by symbol) is the one the earlier stand-alone version used, so what a
  browser already fetched carries over.
  If the page changes, this is the one file to fix.
*/
(function () {
  XFINA_CORE;
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var dmy = function (d) { return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear(); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var rows = function () {
    return Array.prototype.filter.call(document.querySelectorAll('#hsaTable tr'), function (r) { return r.cells.length > 3 && /^\d\d-[A-Za-z]{3}-\d{4}$/.test(r.cells[2].textContent.trim()); });
  };
  var newest = function () {
    var r = rows();
    if (!r.length) return null;
    var p = r[0].cells[2].textContent.trim().split('-');
    var d = new Date(+p[2], MON.indexOf(p[1]), +p[0]);
    return isNaN(d) ? null : d;
  };
  var reqs = function () { return performance.getEntriesByType('resource').filter(function (e) { return e.name.indexOf('generateSecurityWiseHistoricalData') > 0 && e.name.indexOf('csv=true') < 0; }).length; };

  xfinaPanel({
    title: 'NSE ETFs',
    key: 'xfina.nseEtf.v1',
    host: 'nseindia.com',
    wrongSite: 'open nseindia.com (Market Data, Historical Reports, Security-wise Archives) and click this bookmark again.',
    wrongPage: 'open the Security-wise Archives page on nseindia.com (nseindia.com/report-detail/eq_security) and click this bookmark again.',
    ready: function () { return typeof $ === 'function' && $.fn && $.fn.datepicker && document.getElementById('hsa-symbol') && document.querySelector('.filterbtn'); },
    years: 5,
    items: JSON.parse('__SYMBOLS__').map(function (x) { return { id: x[0], code: x[0], name: x[1], from: x[2] }; }),
    prepare: async function (it, c) {
      var sym = await c.look('#hsa-symbol', 'the symbol box');
      sym.focus();
      sym.value = it.code;
      sym.dispatchEvent(new Event('input', { bubbles: true }));
      var sug = await c.wait(function () { return document.querySelector('.tt-suggestion'); }, 8000);
      if (!sug) throw new Error('not in the page\'s symbol list');
      c.tap(sug);
      await c.pause(1200);
      var ser = await c.look('#hsa_Series_filter', 'the series list');
      if ([].some.call(ser.options, function (o) { return o.value === 'EQ'; })) { ser.value = 'EQ'; ser.dispatchEvent(new Event('change', { bubbles: true })); }
    },
    fetch: async function (it, w, c) {
      if (!document.getElementById('pbc-startDate').offsetParent) {
        c.tap(await c.look('.dayslisting a[data-val=Custom]', 'the Custom dates tab'));
        await c.pause(700);
      }
      await c.look('#pbc-startDate', 'the From date');
      $('#pbc-startDate').datepicker().value(dmy(w[0]));
      await c.look('#pbc-endDate', 'the To date');
      $('#pbc-endDate').datepicker().value(dmy(w[1]));
      await c.nap();
      var n0 = reqs();
      (await c.look('.filterbtn', 'the GO button')).click();
      if (!(await c.wait(function () { return reqs() > n0; }, 30000))) throw new Error('the page didn\'t return the table');
      await c.pause(900);
      var err = document.getElementById('hsa-date-error');
      if (err && err.textContent.trim()) throw new Error(err.textContent.trim());
      var e = newest();
      if (!e) return null;
      await c.nap();
      var ex = await c.look('#downloadcsvSecuritywisearchive', 'the Download (.csv) link');
      await c.grab(function () { $(ex).trigger('click'); }, it.code + '-' + iso(w[0]) + '-to-' + iso(w[1]) + '.csv');
      return e;
    }
  });
})();
