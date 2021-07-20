/* globals it describe beforeEach */

const assert = require('assert')
const { EventEmitter } = require('stream')
const EthereumProvider = require('../')

class TestConnection extends EventEmitter {
  send (payload) {
    let result
    if (payload.method === 'eth_accounts') {
      result = ['0x58c99d4AfAd707268067d399d784c2c8a763B1De']
    } else if (payload.method === 'net_version') {
      result = '4'
    }

    this.emit('payload', { id: payload.id, result })
  }
}

describe('non-standard interface', () => {
  let provider

  beforeEach(async () => {
    provider = new EthereumProvider(new TestConnection())
    await provider.enable()
  })

  it('exposes the current chainId', () => assert(provider.chainId === '0x4'))
  it('exposes the current network version', () => assert(provider.networkVersion === '4'))
  it('exposes the currently selected account', () => assert(provider.selectedAddress === '0x58c99d4AfAd707268067d399d784c2c8a763B1De'))
})
