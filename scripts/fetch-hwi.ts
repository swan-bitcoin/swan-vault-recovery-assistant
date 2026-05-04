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
const SHA256SUMS_URL = `https://github.com/bitcoin-core/HWI/releases/download/${HWI_VERSION}/SHA256SUMS.txt.asc`
const MIB_SIZE = 1024 * 1024

// GPG key fingerprint of achow101 (Ava Chow), Bitcoin Core maintainer and HWI author.
// This is the trust anchor for verifying the SHA256SUMS.txt.asc signature.
// Key can be fetched from: gpg --keyserver keys.openpgp.org --recv-keys <fingerprint>
const HWI_SIGNING_KEY = '152812300785C96444D3334D17565732E08E5E41'

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

function ensureGpgKey(): void {
  try {
    const result = execSync(`gpg --list-keys ${HWI_SIGNING_KEY} 2>&1`, { encoding: 'utf8' })
    if (result.includes(HWI_SIGNING_KEY)) return
  } catch {
    // Key not in keyring, try to import it
  }

  console.log(`importing HWI signing key ${HWI_SIGNING_KEY} from keys.openpgp.org ...`)
  try {
    execSync(`gpg --keyserver keys.openpgp.org --recv-keys ${HWI_SIGNING_KEY}`, {
      stdio: 'inherit',
    })
  } catch {
    throw new Error(
      `Failed to import GPG key ${HWI_SIGNING_KEY}.\n` +
        `You can import it manually: gpg --keyserver keys.openpgp.org --recv-keys ${HWI_SIGNING_KEY}`
    )
  }
}

async function fetchAndVerifyChecksums(tmpdir: string): Promise<Record<string, string>> {
  console.log(`downloading SHA256SUMS.txt.asc from ${SHA256SUMS_URL} ...`)
  const response = await fetch(SHA256SUMS_URL)
  if (!response.ok) {
    throw new Error(`Failed to download SHA256SUMS.txt.asc: ${response.status} ${response.statusText}`)
  }
  const ascContent = await response.text()
  const ascPath = path.join(tmpdir, 'SHA256SUMS.txt.asc')
  await fs.writeFile(ascPath, ascContent)

  // Verify GPG signature and extract the signed content
  ensureGpgKey()
  let verified: string
  try {
    verified = execSync(`gpg --verify --output - "${ascPath}" 2>/dev/null`, { encoding: 'utf8' })
  } catch {
    throw new Error(
      `GPG signature verification failed for SHA256SUMS.txt.asc.\n` +
        `The file may have been tampered with, or the signing key may have changed.`
    )
  }
  console.log(`verified GPG signature on SHA256SUMS.txt.asc (key: ${HWI_SIGNING_KEY})`)

  // Parse "hash  filename" lines from the verified content
  const checksums: Record<string, string> = {}
  for (const line of verified.split('\n')) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/)
    if (match) {
      checksums[match[2]] = match[1]
    }
  }

  if (Object.keys(checksums).length === 0) {
    throw new Error('SHA256SUMS.txt.asc contained no checksums after GPG verification.')
  }

  return checksums
}

async function downloadHwi(
  platform: string,
  triple: string,
  checksums: Record<string, string>
): Promise<boolean> {
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
  // Look up the checksum for the extracted binary (e.g., "hwi-3.2.0-mac-arm64.tar.gz/hwi")
  const binaryName = platform === 'win32' ? 'hwi.exe' : 'hwi'
  const checksumKey = `${archiveFilename}/${binaryName}`
  const expected = checksums[checksumKey]
  if (!expected) {
    throw new Error(
      `No checksum found for ${checksumKey} in GPG-verified SHA256SUMS.txt.asc.\n` +
        `Available entries: ${Object.keys(checksums).join(', ')}`
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

  // Download and GPG-verify the SHA256SUMS.txt.asc, then parse checksums
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwi-checksums-'))
  let checksums: Record<string, string>
  try {
    checksums = await fetchAndVerifyChecksums(tmpdir)
  } finally {
    await fs.rm(tmpdir, { recursive: true, force: true })
  }

  // Download HWI for the host architecture
  await downloadHwi(platform, triple, checksums)

  // On macOS, also download HWI for the other architecture to support universal builds
  // CI builds on Intel (x86_64) but users may run on Apple Silicon (aarch64) or vice versa
  if (platform === 'darwin') {
    const otherTriple = triple.startsWith('aarch64')
      ? triple.replace('aarch64', 'x86_64')
      : triple.replace('x86_64', 'aarch64')
    await downloadHwi(platform, otherTriple, checksums)
  }
}
main()
