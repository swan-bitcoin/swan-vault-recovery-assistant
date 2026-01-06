import { Readable } from 'stream'
import { execSync } from 'child_process'
import * as unzip from 'unzip-stream'
import * as fs from 'fs/promises'
import { createWriteStream } from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as tar from 'tar'
import progress from 'progress-stream'

// HWI binaries are downloaded from swan-bitcoin/HWI-builder rather than bitcoin-core/HWI.
// This build-only repository produces binaries from the official upstream source code because
// the official release process has stalled. See https://github.com/swan-bitcoin/HWI-builder
const HWI_VERSION = '3.2.0+swan.1'
const URL_BASE = `https://github.com/swan-bitcoin/HWI-builder/releases/download/${HWI_VERSION}/hwi-${HWI_VERSION}`

// restore this when bitcoin-core/HWI releases a new version above 3.1.0 and retire swan-bitcoin/HWI-builder
// const HWI_VERSION = '3.1.0'
// const URL_BASE = `https://github.com/bitcoin-core/HWI/releases/download/${HWI_VERSION}/hwi-${HWI_VERSION}`
const MIB_SIZE = 1024 * 1024

function progressStream(totalSize: number) {
  const progressStream = progress({
    length: totalSize,
    time: 10000 /* 10 seconds */,
  })
  progressStream.on('progress', (progress) => {
    const transferred = (progress.transferred / MIB_SIZE).toFixed(2)
    const total = (progress.length / MIB_SIZE).toFixed(2)
    console.log(`downloading... ${transferred} / ${total} MiB (${progress.percentage.toFixed(2)}%)`)
  })
  return progressStream
}

function makeUrl(platform: string, triple: string) {
  let arch = triple.split('-')[0]
  if (platform === 'win32') return `${URL_BASE}-windows-${arch}.zip`
  let hwiPlatform: string
  switch (platform) {
    case 'linux':
      hwiPlatform = 'linux'
      break
    case 'darwin':
      hwiPlatform = 'mac'
      if (arch === 'aarch64') arch = 'arm64'
      break
    default:
      throw new Error(`Unexpected platform: ${platform}`)
  }
  return `${URL_BASE}-${hwiPlatform}-${arch}.tar.gz`
}

function extractor(platform: string, tmpdir: string) {
  if (platform !== 'win32') return tar.x({ cwd: tmpdir }, ['hwi'])
  return unzip.Parse().on('entry', function (entry) {
    if (entry.path === 'hwi.exe') {
      entry.pipe(createWriteStream(path.join(tmpdir, 'hwi')))
    } else {
      entry.autodrain()
    }
  })
}

async function main() {
  const data = execSync('rustc -vV').toString()
  const triple = data.match(/host: ([^\s]+)/)[1]
  const platform = os.platform()
  const url = makeUrl(platform, triple) // make url ASAP to fail fast on unsupported platform
  const hwiFile = path.join('src-tauri', `hwi-${triple}${platform === 'win32' ? '.exe' : ''}`)
  try {
    await fs.access(hwiFile)
    return // HWI already in the expected place
  } catch {
    // Need to get HWI
  }
  // tmpdir in destination so rename is atomic and never cross-device
  const tmpdir = await fs.mkdtemp(path.join('src-tauri', '.tmphwi-'))
  try {
    console.log(`downloading HWI from ${url} ...`)
    const hwiStream = await fetch(url).then((r) => {
      const size = Number(r.headers.get('content-length'))
      return Readable.fromWeb(r.body as any)
        .pipe(progressStream(size))
        .pipe(extractor(platform, tmpdir))
    })
    await new Promise((resolve) => hwiStream.on('finish', resolve))
    await fs.rename(path.join(tmpdir, 'hwi'), hwiFile)
  } finally {
    await fs.rm(tmpdir, { recursive: true, force: true })
  }
}
main()
