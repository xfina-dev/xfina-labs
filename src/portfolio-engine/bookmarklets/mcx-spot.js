/*
  Xfina bookmarklet: MCX Spot Market Price (Archives), made once and used again and again.

  Runs on mcxindia.com only, on the Spot Market Price page, in the shared panel (core.js: modes, memory, pacing,
  folder, states). For each commodity/location pair it does what a person does on that page: opens the Archives tab,
  picks the commodity and location, sets Session to ALL, sets the date range, presses Show and, once the page has the
  rows, presses the page's own Excel export button. The file is MCX's own (a table wrapped as .xls, named
  SpotMarket_<timestamp>.xls); since that name carries no commodity or date, the label is put in front of it when
  saving to a folder. Nothing is sent to Xfina.

  MCX's Archive takes no date-range cap: one Show returns the whole range (tested: 2005 to today, ~14,600 rows, one
  call), so each run is one file per commodity (years 0). Session is always ALL: MCX's own Session label is only
  reliably filled in recent years (checked live: 2020 returns no rows for Session 3, 2006 almost none), so filtering
  here would silently drop most of the history. The file keeps every poll of the day; the importer picks one a day.

  MCX's terms restrict "systematic or automated data collection" with no personal-use exception, the same category
  as NSE's. This does the same clicking a person would, on the same page and buttons, one file at a time, at a human
  pace; the card says so plainly and leaves the choice to the reader.

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __PRODUCTS__, JSON,
  [["GOLD", "AHMEDABAD", "MCX Spot Market Price: Gold (Ahmedabad)", "2005-06-06"], ...]: MCX's commodity code, its
  polling location, a label, the first date to ask for. Memory is keyed "GOLD|AHMEDABAD", under the earlier
  stand-alone version's key (xfina.mcxSpot.v1), so what a browser already fetched carries over.
  If the page changes, this is the one file to fix.
*/
(function () {
  XFINA_CORE;
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var q = function (id) { return document.getElementById(id); };
  var dmy = function (d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); };
  var parseShown = function (s) { var p = s.trim().split(' '); return new Date(+p[2], MON.indexOf(p[1]), +p[0]); };
  var set = function (el, v) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  var xlsShown = function () { var e = q('btnArchiveXLS'); return e && e.offsetParent !== null; };
  var xlsEmpty = function () { var t = document.querySelector('#Archive-tabledata tbody'); return t && /data not available/i.test(t.textContent); };
  var reqs = function () { return performance.getEntriesByType('resource').filter(function (e) { return e.name.indexOf('GetSpotMarketArchive') > 0; }).length; };
  var newest = function () {
    var r = document.querySelector('#Archive-tabledata tbody tr');
    var c = r && r.cells[5];
    if (!c) return null;
    var d = parseShown(c.textContent);
    return isNaN(d) ? null : d;
  };

  xfinaPanel({
    title: 'MCX Spot Price',
    key: 'xfina.mcxSpot.v1',
    url: 'https://www.mcxindia.com/market-data/spot-market-price',
    page: 'Spot Market Price',
    ready: function () { return !!(q('Archive-Commodity') && q('btnArchive')); },
    years: 0,
    items: JSON.parse('__PRODUCTS__').map(function (x) { return { id: x[0] + '|' + x[1], code: x[0], name: x[2], from: x[3], loc: x[1] }; }),
    prepare: async function (it, c) {
      var arch = Array.prototype.filter.call(document.querySelectorAll('button.toggle-button'), function (b) { return b.getAttribute('data-content') === 'Archive'; })[0];
      if (arch && arch.className.indexOf('active') < 0) { (await c.look(arch, 'the Archives tab')).click(); await c.pause(400); }
      set(await c.look('#Archive-Commodity', 'the commodity list'), it.code);
      set(await c.look('#Archive-Location', 'the location list'), it.loc);
      var ses = q('ddlSelectSeesion');
      if (ses) set(ses, '0');
    },
    fetch: async function (it, w, c) {
      set(await c.look('#ArchivefromDate', 'the From date'), dmy(w[0]));
      set(await c.look('#ArchiveToDate', 'the To date'), dmy(w[1]));
      await c.nap();
      var n0 = reqs();
      (await c.look('#btnArchive', 'the Show button')).click();
      if (!(await c.wait(function () { return reqs() > n0; }, 25000))) throw new Error('the page didn\'t return results');
      await c.pause(500);
      if (!(await c.wait(function () { return xlsShown() || xlsEmpty(); }, 5000))) throw new Error('the page didn\'t show the results');
      if (xlsEmpty()) return null;
      var e = newest();
      await c.nap();
      var ex = await c.look('#btnArchiveXLS', 'the Excel export button');
      await c.grab(function () { ex.click(); }, 'SpotMarket.xls', it.name);
      return e || w[1];
    }
  });
})();
