/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-bid-review`.
 * @module @deepseek-ai/dsh-client-ui-bid-review/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-bid-review'

/** Cordis companion plugin name. */
export const name = 'client-ui-bid-review-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin owns exactly one slot registration,
 * withdrawn by the same effect disposer that installed it, and keeps no
 * cross-render authority of its own — the composer's document lives in React
 * state and this browser's sessionStorage, and the durable qualifications
 * record belongs to the Host service, which asserts its own limits.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
