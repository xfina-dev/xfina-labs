// How to get data has moved into Datasets, where choosing, getting, importing
// and holding are one screen. The page is kept because the old URL is linked
// from elsewhere and may be bookmarked: a dead link is a poor way to find out
// something moved. The wizard's path lives in the hash (#equity/us/etf), so it
// is carried across unchanged.
const { hash, search } = window.location;
window.location.replace(`/portfolio-engine/datasets/${search}${hash}`);
