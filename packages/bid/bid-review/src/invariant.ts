/** Package-owned invariant companion. @module @deepseek-ai/dsh-bid-review/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-bid-review'

/** Cordis companion plugin name. */
export const name = 'bid-review-invariant'
/** Services required before the companion can reserve and check package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the domain global slot owns the one shared record,
 * the domain schema validates it on reopen, uploaded files are write-once
 * behind fresh UUID names, and no second authority exists to check.
 */
const install: InvariantInstaller = Object.assign(() => {}, { inject: ['bidReview'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
