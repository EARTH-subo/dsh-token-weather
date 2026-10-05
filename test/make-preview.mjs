// Crop the composer strip out of a full-window screenshot so the README preview
// shows the plugin rather than a wall of chat text.
import fs from 'node:fs'
import path from 'node:path'

const [src, out, x, y, w, h] = process.argv.slice(2)
const root = path.resolve(import.meta.dirname, '..')
const dest = path.join(root, out)
fs.mkdirSync(path.dirname(dest), { recursive: true })

// Run the crop through Pillow (bundled with the workspace's Anaconda env).
const { spawnSync } = await import('node:child_process')
const python = 'D:\\Anaconda3\\envs\\myenv\\python.exe'
const script = `
from PIL import Image, ImageDraw
im = Image.open(r"${src}").convert("RGB")
box = (${x}, ${y}, ${x} + ${w}, ${y} + ${h})
crop = im.crop(box)
# A 1px hairline frame keeps the strip legible on both light and dark README grids.
framed = Image.new("RGB", (crop.width + 2, crop.height + 2), (60, 60, 60))
framed.paste(crop, (1, 1))
framed.save(r"${dest}")
print("saved:", r"${dest}", framed.size)
`
const res = spawnSync(python, ['-c', script], { encoding: 'utf8' })
process.stdout.write(res.stdout || '')
process.stderr.write(res.stderr || '')
if (res.status !== 0) process.exit(res.status ?? 1)
console.log('bytes:', fs.statSync(dest).size)
