// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DocumentTitle } from '../src/DocumentTitle.tsx'

afterEach(() => {
  cleanup()
  document.title = ''
})

describe('DocumentTitle', () => {
  it('preserves the product title without a durable title and restores it on unmount', () => {
    document.title = '金龙鱼餐饮渠道标书审核'
    const mounted = render(<DocumentTitle />)
    expect(document.title).toBe('金龙鱼餐饮渠道标书审核')

    mounted.rerender(<DocumentTitle title="First title" />)
    expect(document.title).toBe('First title — 金龙鱼餐饮渠道标书审核')

    mounted.rerender(<DocumentTitle title="Revised title" />)
    expect(document.title).toBe('Revised title — 金龙鱼餐饮渠道标书审核')

    mounted.rerender(<DocumentTitle />)
    expect(document.title).toBe('金龙鱼餐饮渠道标书审核')
    mounted.unmount()
    expect(document.title).toBe('金龙鱼餐饮渠道标书审核')
  })
})
