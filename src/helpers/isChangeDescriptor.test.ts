import { describe, it, expect } from 'vitest'
import { isChangeDescriptor } from './isChangeDescriptor'

describe('helpers/isChangeDescriptor', () => {
  it('should return true for change descriptor', () => {
    const validDescriptor =
      'wsh(multi(2,[7737acb8]tpubD6NzVbkrYhZ4X3vCdevm3aFUdeSAWsbR4UhhdApbXnVUnvuwtq5NYqQ7zCkNhYG4JcPdGW4Wg4ZrVSYGpdoWsn337qmkP6CFgs7pZid12Sa/1/*,[8c24a510/48h/1h/0h/2h]tpubDDzWqfZ5TH48383Byd9PFGxEP1Ws5NVXyYcHTmnHwmhJciowLeBDWNHcpLGocofanSyVHeiNqL4HZkXZfKM7NKm7gZZoPjmA9vTKPpwRSkx/1/*,[dcbf0caf/48h/1h/0h/2h]tpubDFd7VxopNeZg93uqR7CSvJLkw3UanF8rywdQTxhCPFt1P33eZkxJJ91XXEbY2Q4Suw3jyscRwGzjVyfgq97N7sRvPHQVxruHwsKvsvQizSk/1/*))#thlm9208'
    expect(isChangeDescriptor(validDescriptor)).toBe(true)
  })

  it('should return false for receive descriptor', () => {
    const invalidDescriptor =
      'wsh(multi(2,[7737acb8]tpubD6NzVbkrYhZ4X3vCdevm3aFUdeSAWsbR4UhhdApbXnVUnvuwtq5NYqQ7zCkNhYG4JcPdGW4Wg4ZrVSYGpdoWsn337qmkP6CFgs7pZid12Sa/0/*,[8c24a510/48h/1h/0h/2h]tpubDDzWqfZ5TH48383Byd9PFGxEP1Ws5NVXyYcHTmnHwmhJciowLeBDWNHcpLGocofanSyVHeiNqL4HZkXZfKM7NKm7gZZoPjmA9vTKPpwRSkx/0/*,[dcbf0caf/48h/1h/0h/2h]tpubDFd7VxopNeZg93uqR7CSvJLkw3UanF8rywdQTxhCPFt1P33eZkxJJ91XXEbY2Q4Suw3jyscRwGzjVyfgq97N7sRvPHQVxruHwsKvsvQizSk/0/*))#scfc2wh5'
    expect(isChangeDescriptor(invalidDescriptor)).toBe(false)
  })
})
