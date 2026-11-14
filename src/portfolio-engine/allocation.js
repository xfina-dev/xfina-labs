// The portfolio's assets, shared by every step: exactly the assets the Series step uses (store.js keeps them in
// step), with the type of the series picked for each. The Allocation card edits weight, colour and order, and
// the results' legend and charts follow. Colours start in xfina-ui's slot order (chart-1, chart-2, …), the
// order its palette was checked in for colour-blind separation.
import { reactive } from 'vue';

export const ASSETS = reactive([]); // [{ key, name, type, weight, color }]
