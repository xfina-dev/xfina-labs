// The Portfolio Engine's data and checks name a state 'ok', 'warn' or 'err';
// xfina-ui's Badge calls the same states good, warning and critical.
export const tone = (state) => ({ ok: 'good', warn: 'warning', err: 'critical' })[state] ?? state;
