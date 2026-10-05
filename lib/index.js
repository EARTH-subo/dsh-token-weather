/**
 * Token Weather — node half.
 *
 * Pure UI surface: the browser half ships through `exports["./client"]` and is
 * discovered from the `dsh.client` declaration in package.json. The empty apply
 * exists only so the package appears as a Loader entry on the host side.
 */
/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply() {}
