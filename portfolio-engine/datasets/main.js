// Datasets is now Series: the screen names what it holds, and the Portfolio
// Engine's own first step is Assets. The old URL is kept because it has been
// linked and may be bookmarked, and it carries the stage or wizard path in its
// hash across.
const { hash, search } = window.location;
window.location.replace(`/portfolio-engine/series/${search}${hash}`);
