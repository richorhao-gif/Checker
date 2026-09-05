/**
 * The surface decision the composer cannot make from its own state: the owner's
 * inert posture, the Session's removal, and the Session's composer phase decide
 * which shape renders, and a failed first prompt must stay interactive so the
 * same document can be retried instead of re-uploaded.
 */
import { describe, expect, it } from 'vitest'
import type { ComposerPhase } from '@deepseek-ai/dsh-client-runtime/client'
import { deriveSurface } from '../src/client/surface.ts'
import type { SurfaceFacts } from '../src/client/surface.ts'

function facts(overrides: Partial<SurfaceFacts> = {}): SurfaceFacts {
  return {
    disabled: false, removed: false, composerPhase: 'blank', promptFailed: false, ...overrides,
  }
}

describe('deriveSurface', () => {
  it('holds the workspace shape while the owner keeps the seat inert', () => {
    // The owner's inert posture outranks every Session fact: no Workspace is
    // connected yet, so there is nothing to submit to.
    expect(deriveSurface(facts({ disabled: true }))).toBe('workspace')
    expect(deriveSurface(facts({ disabled: true, removed: true, composerPhase: 'active' }))).toBe('workspace')
  })

  it('reports a Session removed on the Host', () => {
    expect(deriveSurface(facts({ removed: true }))).toBe('removed')
    expect(deriveSurface(facts({ removed: true, composerPhase: 'active' }))).toBe('removed')
  })

  it('stays interactive while the fixed question is unsent', () => {
    expect(deriveSurface(facts({ composerPhase: 'blank' }))).toBe('interactive')
  })

  it('returns to interactive after a failed first prompt', () => {
    expect(deriveSurface(facts({ composerPhase: 'engaging', promptFailed: true }))).toBe('interactive')
  })

  it('locks once the review is under way', () => {
    expect(deriveSurface(facts({ composerPhase: 'engaging' }))).toBe('locked')
    expect(deriveSurface(facts({ composerPhase: 'active' }))).toBe('locked')
    // A later prompt failure is the transcript's business, not this surface's:
    // the review already started, so the document stays submitted.
    expect(deriveSurface(facts({ composerPhase: 'active', promptFailed: true }))).toBe('locked')
  })

  it('locks while no Session is current and the seat is not inert', () => {
    const phase: ComposerPhase | undefined = undefined
    expect(deriveSurface(facts({ composerPhase: phase }))).toBe('locked')
  })
})
