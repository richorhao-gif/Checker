/**
 * Bid-review plugin, browser half: the entry that shadows
 * 'conversation.composer.bar' at a lower priority, so the conversation surface
 * offers a one-document intake and the fixed review question instead of a
 * free-text bar. The Host owns the shared company qualifications and the stored
 * document path; this half only folds the four Remote operations into the
 * composer's settled outcome shape.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the composer.bar entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BidReviewComposer } from './BidReviewComposer.tsx'
import type { BidReviewInjected } from './slots.ts'
import { readLimits, readQualifications, saveQualifications, uploadDocument } from './remote.ts'
import { en, zh } from './locales.ts'

export type { BidReviewComposerProps, BidReviewInjected } from './slots.ts'
export type { BidReviewKey } from './locales.ts'
export type { BidReviewSurface, BidReviewStep, SurfaceFacts } from './surface.ts'
export type { Outcome, ReviewFailure } from './remote.ts'
export type { StoredDocument } from './document.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'bidReview'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'remote', 'remote.bidReview', 'locale']

/**
 * Client plugin body: register the shadowing composer entry and its copy. The
 * slot is declared by ui-conversation, so the entry rides that declaration's
 * inject point and withdraws with this plugin's effect disposal.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-bid-review: dictionaries')

  ctx.slots.inject('conversation.composer.bar', () => ctx.slots.register({
    name: 'conversation.composer.bar',
    priority: -1,
    locale: NS,
    registrant: 'ui-bid-review',
    inject: (): BidReviewInjected => ({
      readLimits: () => readLimits(ctx.remote.bidReview),
      readQualifications: () => readQualifications(ctx.remote.bidReview),
      saveQualifications: text => saveQualifications(ctx.remote.bidReview, text),
      uploadDocument: file => uploadDocument(ctx.remote.bidReview, file),
    }),
  }, BidReviewComposer))
}
