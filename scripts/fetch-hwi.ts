import { Readable } from 'stream'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import * as unzip from 'unzip-stream'
import * as fs from 'fs/promises'
import { createWriteStream, createReadStream } from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as tar from 'tar'
import progress from 'progress-stream'

// HWI binaries are downloaded from bitcoin-core/HWI official releases.
// See https://github.com/bitcoin-core/HWI/releases
const HWI_VERSION = '3.2.0'
const URL_BASE = `https://github.com/bitcoin-core/HWI/releases/download/${HWI_VERSION}/hwi-${HWI_VERSION}`
const MIB_SIZE = 1024 * 1024

// SHA-256 checksums of the extracted hwi binaries from the GPG-signed SHA256SUMS.txt.asc
// published at https://github.com/bitcoin-core/HWI/releases/tag/3.2.0
const EXPECTED_BINARY_CHECKSUMS: Record<string, string> = {
  'hwi-3.2.0-linux-aarch64.tar.gz': 'c2117b96d318be0ceac217098933834ef88376c704ca9fadacd83c9471066dcc',
  'hwi-3.2.0-linux-x86_64.tar.gz': 'd9cc65de95e3cf93fd3c953d589184a00180624ffc5ad17aade97616a8919fa6',
  'hwi-3.2.0-mac-arm64.tar.gz': '87a8991848a0216213ddf6497c753cebbda492626afaf5608c30931155c922c3',
  'hwi-3.2.0-mac-x86_64.tar.gz': 'b3764a530b635e7a7348c9185e09e74b389f5f585094fe316f700eec7c761875',
  'hwi-3.2.0-windows-x86_64.zip': 'e068d91b664597425a8ead02d7b86a02ad6c4b72746c42961f58a58b08f9fd79',
}

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

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
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
  const archiveFilename = url.split('/').pop()!
  const expected = EXPECTED_BINARY_CHECKSUMS[archiveFilename]
  if (!expected) {
    throw new Error(`No known checksum for ${archiveFilename}. Cannot verify integrity.`)
  }

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

    const hwiPath = path.join(tmpdir, 'hwi')
    const actual = await sha256File(hwiPath)
    if (actual !== expected) {
      throw new Error(
        `SHA-256 checksum mismatch for ${archiveFilename}!\n` +
          `  expected: ${expected}\n` +
          `  actual:   ${actual}\n` +
          `The downloaded binary may be corrupted or tampered with.`
      )
    }
    console.log(`verified SHA-256 for ${archiveFilename}: ${actual}`)

    await fs.rename(hwiPath, hwiFile)
    return true
  } finally {
    await fs.rm(tmpdir, { recursive: true, force: true })
  }
}

async function main() {
  const data = execSync('rustc -vV').toString()
  const triple = data.match(/host: ([^\s]+)/)![1]
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
