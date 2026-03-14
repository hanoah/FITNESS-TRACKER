import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const svgPath = join(publicDir, 'favicon.svg')

const svg = readFileSync(svgPath)

for (const size of [192, 512]) {
  const buffer = await sharp(svg)
    .resize(size, size)
    .png()
    .toBuffer()
  const outPath = join(publicDir, `icon-${size}x${size}.png`)
  writeFileSync(outPath, buffer)
  console.log(`Created ${outPath}`)
}
