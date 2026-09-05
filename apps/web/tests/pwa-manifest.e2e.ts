import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: '金龙鱼餐饮渠道标书审核',
    short_name: '金龙鱼标审',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }],
  })
})

it('ships a favicon that brightens the seal and rings a light halo under dark color scheme', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  // Light mode carries the fixed brand colors: vermilion seal, gold fish.
  expect(favicon).toContain('#C8102E')
  expect(favicon).toContain('#D9A441')
  // Dark mode brightens the seal and adds a white halo so the mark separates
  // from dark browser chrome (not the old all-paths-white flip).
  expect(favicon).toContain('@media (prefers-color-scheme: dark)')
  expect(favicon).toContain('#E23A4C')
  expect(favicon).toContain('stroke: #fff')
})
