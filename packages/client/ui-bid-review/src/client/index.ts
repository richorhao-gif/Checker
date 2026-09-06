/**
 * Bid-review plugin, browser half: the entry that shadows
 * 'conversation.composer.bar' at a lower priority, so the conversation surface
 * offers a one-document intake and the fixed review question instead of a
 * free-text bar, and the entry that shadows the 'chat' cell of
 * 'conversation.view', so a submitted review reads as one sheet under review
 * instead of a transcript. The Host owns the shared company qualifications and
 * the stored document path; this half only folds the four Remote operations
 * into the settled outcome shape both surfaces read.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merges (the composer.bar and view rows).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BidReviewComposer } from './BidReviewComposer.tsx'
import { ReviewDesk } from './ReviewDesk.tsx'
import type { BidReviewInjected, ReviewDeskInjected } from './slots.ts'
import { readLimits, readQualifications, saveQualifications, uploadDocument } from './remote.ts'
import { en, zh } from './locales.ts'

export type { BidReviewComposerProps, BidReviewInjected, ReviewDeskInjected, ReviewDeskProps } from './slots.ts'
export type { BidReviewKey } from './locales.ts'
export type { BidReviewSurface, BidReviewStep, SurfaceFacts } from './surface.ts'
export type {
  DeskActivity, DeskBasis, DeskDot, DeskFailure, DeskFacts, DeskSealInk, DeskStage, DeskTick,
  DeskVerdict, DeskView, DeskWait,
} from './desk.ts'
export type { Outcome, ReviewFailure } from './remote.ts'
export type { StoredDocument } from './document.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'bidReview'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'remote', 'remote.bidReview', 'locale']

/**
 * Client plugin body: register the two shadowing entries and this plugin's
 * copy. Both slots are declared by ui-conversation, so each entry rides that
 * declaration's inject point and withdraws with this plugin's effect disposal.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-bid-review: dictionaries')

  // Registration-time text (the view tab label) reads through the bound
  // translate as a thunk, so it follows the active locale without
  // re-registration; the desk itself reads the standard `t` seat.
  const t = ctx.locale.bind(NS)

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

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'chat',
    priority: -1,
    order: 0,
    locale: NS,
    label: () => t('desk.view.label'),
    registrant: 'ui-bid-review',
    inject: (sessionId: SessionId): ReviewDeskInjected => ({
      readLimits: () => readLimits(ctx.remote.bidReview),
      readQualifications: () => readQualifications(ctx.remote.bidReview),
      // The desk pages until its submission enters the window; a binding gone
      // by the time the effect fires is a teardown race, not a state to report.
      loadOlder: () => { void ctx.sessions.binding(sessionId)?.session.loadOlder() },
    }),
  }, ReviewDesk))
}
