import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const outdir = path.join(root, 'site')
const entrypoints = [
  'pages/demos/index.html',
  'pages/demos/accordion.html',
  'pages/demos/bubbles.html',
  'pages/demos/dynamic-layout.html',
  'pages/demos/masonry/index.html',
]

const result = Bun.spawnSync(
  ['bun', 'build', ...entrypoints, '--outdir', outdir],
  {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  },
)

if (result.exitCode !== 0) {
  process.exit(result.exitCode)
}

for (const route of ['accordion', 'bubbles', 'dynamic-layout']) {
  await moveHtmlToDirectoryRoute(route)
}

async function moveHtmlToDirectoryRoute(route: string): Promise<void> {
  const htmlPath = path.join(outdir, `${route}.html`)
  const routeDir = path.join(outdir, route)
  const targetPath = path.join(routeDir, 'index.html')

  let html = await readFile(htmlPath, 'utf8')
  html = html.replaceAll('src="./', 'src="../')
  html = html.replaceAll('href="./', 'href="../')

  await mkdir(routeDir, { recursive: true })
  await writeFile(targetPath, html)
  await rm(htmlPath)
}
