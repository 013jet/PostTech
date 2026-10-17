// Export the diagram from its self-contained HTML source. No runtime or network changes.
import { readFile, writeFile } from 'node:fs/promises'
const source = new URL('../docs/architecture.html', import.meta.url)
const html = await readFile(source, 'utf8')
const start = '<!-- architecture-svg:start -->'
const end = '<!-- architecture-svg:end -->'
if (!html.includes(start) || !html.includes(end)) throw new Error('Architecture SVG boundaries not found')
let svg = html.split(start)[1].split(end)[0].trim()
// Resolve theme variables for renderers that do not support SVG CSS custom properties.
const colors = { 'svg-bg': '#ffffff', 'svg-text': '#0f1a26', 'svg-dim': '#4d6074', 'svg-border': '#818f9e', 'svg-accent': '#246b53' }
for (const [token, color] of Object.entries(colors)) svg = svg.replaceAll(`var(--${token})`, color)
svg = svg.replaceAll('fill="context-stroke"', 'fill="#4d6074"')
svg = svg.replace('<rect class="arch-bound"', '<rect width="1040" height="640" fill="#ffffff"/>\n<rect class="arch-bound"')
await writeFile(new URL('../docs/architecture.svg', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`)
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(match[1])
console.log('Architecture SVG exported; inline JavaScript syntax valid.')
