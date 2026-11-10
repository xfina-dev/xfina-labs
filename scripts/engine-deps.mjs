// Puts the two libraries the Portfolio Engine's WASM module composes where its
// Cargo.toml expects them: engine/vendor/xfina and engine/vendor/xfingine.
//
// The module depends on both `xfina` (it reads the publishers' downloads) and
// `xfingine` (the computation). Neither library depends on the other, and that
// stays true: the composition belongs to the application, so it lives here.
//
// Both are path dependencies rather than crates.io versions because the two
// surfaces this needs are ahead of their releases: `xfina`'s market-data
// parsers and, when it lands, `xfingine`'s portfolio engine API
// (xfina-dev/xfingine#15). Point them at a published version instead -- in
// engine/Cargo.toml -- as soon as both are out, and this script and the
// vendor directory go away with them.
//
// A sibling checkout is used when there is one, so a change to either library
// shows up in the next build without a push; CI has none, so it clones.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPOS = {
  xfina: 'https://github.com/xfina-dev/xfina',
  xfingine: 'https://github.com/xfina-dev/xfingine',
};

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const vendor = join(root, 'engine', 'vendor');

// Where the sibling checkouts would be. In a git worktree the repository's own
// folder is somewhere under .claude/, so the parent of the main checkout is the
// one to look beside, not the parent of this working tree.
function candidates() {
  const out = [resolve(root, '..')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    if (common) out.push(resolve(dirname(common), '..'));
  } catch {
    // Not a git checkout, or no git: the parent folder is all there is to try.
  }
  return [...new Set(out)];
}

function present(path) {
  try {
    // A symlink to a folder that has gone counts as absent, so a stale link is
    // replaced rather than handed to cargo.
    lstatSync(path);
    return existsSync(join(path, 'Cargo.toml'));
  } catch {
    return false;
  }
}

mkdirSync(vendor, { recursive: true });
for (const [name, url] of Object.entries(REPOS)) {
  const target = join(vendor, name);
  if (present(target)) {
    console.log(`engine deps: ${name} is already in place`);
    continue;
  }
  rmSync(target, { force: true, recursive: true });
  const sibling = candidates()
    .map((dir) => join(dir, name))
    .find((dir) => existsSync(join(dir, 'Cargo.toml')));
  if (sibling) {
    symlinkSync(sibling, target, 'dir');
    console.log(`engine deps: ${name} → ${sibling}`);
    continue;
  }
  console.log(`engine deps: cloning ${name} from ${url}`);
  execFileSync('git', ['clone', '--depth', '1', url, target], { stdio: 'inherit' });
}
