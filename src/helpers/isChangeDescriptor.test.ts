import { describe, it, expect } from 'vitest'
import { isChangeDescriptor } from './isChangeDescriptor'

describe('helpers/isChangeDescriptor', () => {
  it.each([
    'wpkh([7737acb8]tpubD6N...izSk/1/*)',
    'wpkh([7737acb8]tpubD6N...izSk/1/*)#cafebabe',
    'wsh(multi(2,[7737acb8]tpubD6N...izSk/1/*))#thlm9208',
    'wsh(multi(2,[7737acb8]tpubD6N...izSk/1/*))',
    'wsh(wsh(multi(2,[7737acb8]tpubD6N...izSk/1/*)))',
    'wsh(wsh(multi(2,[7737acb8]tpubD6N...izSk/1/*)))#deadbeef',
    'izSk/1/*))))))))))))))))))#deadbeef',
  ])('should return true for change descriptor %s', (descriptor) => {
    expect(isChangeDescriptor(descriptor)).toBe(true)
  })

  it('should return false for receive descriptor', () => {
    const receiveDescriptor =
      'wsh(multi(2,[7737acb8]tpubD6NzVbkrYhZ4X3vCdevm3aFUdeSAWsbR4UhhdApbXnVUnvuwtq5NYqQ7zCkNhYG4JcPdGW4Wg4ZrVSYGpdoWsn337qmkP6CFgs7pZid12Sa/0/*,[8c24a510/48h/1h/0h/2h]tpubDDzWqfZ5TH48383Byd9PFGxEP1Ws5NVXyYcHTmnHwmhJciowLeBDWNHcpLGocofanSyVHeiNqL4HZkXZfKM7NKm7gZZoPjmA9vTKPpwRSkx/0/*,[dcbf0caf/48h/1h/0h/2h]tpubDFd7VxopNeZg93uqR7CSvJLkw3UanF8rywdQTxhCPFt1P33eZkxJJ91XXEbY2Q4Suw3jyscRwGzjVyfgq97N7sRvPHQVxruHwsKvsvQizSk/0/*))#scfc2wh5'
    expect(isChangeDescriptor(receiveDescriptor)).toBe(false)
  })
})
