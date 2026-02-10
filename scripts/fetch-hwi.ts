import { Readable } from 'stream'
import { execSync } from 'child_process'
import * as unzip from 'unzip-stream'
import * as fs from 'fs/promises'
import { createWriteStream } from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as tar from 'tar'
import progress from 'progress-stream'

// HWI binaries are downloaded from bitcoin-core/HWI official releases.
// See https://github.com/bitcoin-core/HWI/releases
const HWI_VERSION = '3.2.0'
const URL_BASE = `https://github.com/bitcoin-core/HWI/releases/download/${HWI_VERSION}/hwi-${HWI_VERSION}`
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

async function downloadHwi(platform: string, triple: string): Promise<boolean> {
  const hwiFile = path.join('src-tauri', `hwi-${triple}${platform === 'win32' ? '.exe' : ''}`)
  try {
    await fs.access(hwiFile)
    console.log(`HWI for ${triple} already exists, skipping download`)
    return true // HWI already in the expected place
  } catch {
    // Need to get HWI
  }

  const url = makeUrl(platform, triple)
  // tmpdir in destination so rename is atomic and never cross-device
  const tmpdir = await fs.mkdtemp(path.join('src-tauri', '.tmphwi-'))
  try {
    console.log(`downloading HWI for ${triple} from ${url} ...`)
    const hwiStream = await fetch(url).then((r) => {
      const size = Number(r.headers.get('content-length'))
      return Readable.fromWeb(r.body as any)
        .pipe(progressStream(size))
        .pipe(extractor(platform, tmpdir))
    })
    await new Promise((resolve) => hwiStream.on('finish', resolve))
    await fs.rename(path.join(tmpdir, 'hwi'), hwiFile)
    return true
  } finally {
    await fs.rm(tmpdir, { recursive: true, force: true })
  }
}

async function main() {
  const data = execSync('rustc -vV').toString()
  const triple = data.match(/host: ([^\s]+)/)[1]
  const platform = os.platform()

  // Download HWI for the host architecture
  await downloadHwi(platform, triple)

  // On macOS, also download HWI for the other architecture to support universal builds
  // CI builds on Intel (x86_64) but users may run on Apple Silicon (aarch64) or vice versa
  if (platform === 'darwin') {
    const otherTriple = triple.startsWith('aarch64')
      ? triple.replace('aarch64', 'x86_64')
      : triple.replace('x86_64', 'aarch64')
    await downloadHwi(platform, otherTriple)
  }
}
main()
