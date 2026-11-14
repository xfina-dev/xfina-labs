// The reference series a run needs, which come with the tool.
//
// Two jobs, and they belong in different places:
//
//   the provision -- that these exist, who publishes them, what each covers and
//                    why you would reach for the long-history one. Data, so
//                    Datasets explains it.
//   the choice    -- which of each pair this run converts with and deflates by.
//                    That changes what a run reports, and the right answer
//                    depends on the run's own period, so it stays with the run,
//                    in the engine's Series step, beside the per-asset pick.
//
// Both read the definitions here, so there is one description of each series
// rather than two to drift apart.
import { reactive } from 'vue';

export const DATA = 'https://data.xfina.dev';

// As Xfina Data's metadata.json described them on 2026-10-07. Both pages read
// the live metadata on load and keep this copy if that fails, so the figures
// here are a fallback, not the truth.
const PUBLISHED = {
  'sbi-forex-card-usd': { path: 'v1/fx/sbi-forex-card-usd.csv', frequency: 'daily', rows: 1593, first: '2020-01-06', last: '2026-10-06' },
  'bis-usd-inr': { path: 'v1/fx/bis-usd-inr.csv', frequency: 'daily', rows: 13610, first: '1973-01-02', last: '2026-09-29' },
  'in-cpi': { path: 'v1/inflation/in-cpi.csv', frequency: 'monthly', rows: 164, first: '2013-01', last: '2026-08' },
  'in-cpi-imf': { path: 'v1/inflation/in-cpi-imf.csv', frequency: 'monthly', rows: 835, first: '1957-01', last: '2026-07' },
};

const provided = (id, name, type, basis, publisher, note) => reactive({
  id, key: `provided|${id}`, name, type, basis, publisher, note, ret: null, origin: 'provided', ...PUBLISHED[id],
});

/// The two pairs, preferred first. `reach` in DataSection.vue says so where a
/// run starts before the preferred one covers.
export const REFERENCE = [
  { key: 'reference|fx', name: 'USD/INR', provided: true, what: 'Turns US and global assets into rupees, day by day.', series: [
    provided('sbi-forex-card-usd', 'SBI forex card', 'FX', 'TT rate', 'State Bank of India', 'TT buy and TT sell: what SBI charges to convert between rupees and dollars on a forex card. Preferred: it is what a transfer actually costs.'),
    provided('bis-usd-inr', 'BIS USD/INR', 'FX', 'Reference rate', 'Bank for International Settlements', 'A reference rate from the Bank for International Settlements, rupees per dollar on each business day. The long history, for runs that start before SBI\'s sheets.'),
  ] },
  { key: 'reference|cpi', name: 'Inflation', provided: true, what: 'Shows results in today\'s rupees, from the run\'s own period.', series: [
    provided('in-cpi', 'MoSPI CPI', 'CPI', 'Index level', 'MoSPI', 'India\'s official consumer price index, all-India combined, 2024 = 100. Preferred: MoSPI\'s own figures.'),
    provided('in-cpi-imf', 'IMF CPI', 'CPI', 'Index level', 'IMF', 'India\'s CPI as the IMF publishes it, on the same 2024 = 100 base. The long history, for runs that start before 2013.'),
  ] },
];

/// Brings the live figures in over the fallback, in place, for every series.
/// Both pages call it; failure leaves the copy above standing.
export async function refreshPublished() {
  try {
    const meta = await (await fetch(`${DATA}/v1/metadata.json`)).json();
    for (const d of meta.datasets || []) {
      for (const a of REFERENCE) {
        for (const s of a.series) if (s.id === d.id) Object.assign(s, { path: d.path, rows: d.rows, first: d.first, last: d.last });
      }
    }
  } catch { /* the fallback stands */ }
}
