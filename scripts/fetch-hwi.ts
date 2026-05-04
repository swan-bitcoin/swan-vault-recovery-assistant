import { Readable } from 'stream'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import * as unzip from 'unzip-stream'
import * as fs from 'fs/promises'
import { createWriteStream, createReadStream, readFileSync } from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as tar from 'tar'
import { fileURLToPath } from 'url'
import progress from 'progress-stream'

// HWI version and checksums are pinned in hwi.json.
// To update, run: ./scripts/bump-hwi.sh <new-version>
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const HWI_CONFIG = JSON.parse(readFileSync(path.join(__dirname, 'hwi.json'), 'utf8')) as {
  version: string
  checksums: Record<string, string>
}
const HWI_VERSION = HWI_CONFIG.version
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
  const binaryName = platform === 'win32' ? 'hwi.exe' : 'hwi'
  const checksumKey = `${archiveFilename}/${binaryName}`
  const expected = HWI_CONFIG.checksums[checksumKey]
  if (!expected) {
    throw new Error(
      `No checksum found for ${checksumKey} in scripts/hwi.json.\n` +
        `Run ./scripts/bump-hwi.sh ${HWI_VERSION} --force to regenerate checksums.`
    )
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
        `SHA-256 checksum mismatch for ${checksumKey}!\n` +
          `  expected: ${expected}\n` +
          `  actual:   ${actual}\n` +
          `The downloaded binary may be corrupted or tampered with.`
      )
    }
    console.log(`verified SHA-256 for ${checksumKey}: ${actual}`)

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

  console.log(`HWI version: ${HWI_VERSION} (from scripts/hwi.json)`)

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
