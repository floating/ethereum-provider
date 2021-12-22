/* globals it describe beforeEach */

const { fail } = require('assert')
const assert = require('assert')
const { EventEmitter } = require('stream')
const EthereumProvider = require('../')

class TestConnection extends EventEmitter {
  constructor () {
    super()

    this.requests = {}

    setTimeout(() => this.emit('connect'), 0)
  }

  send (payload) {
    this.requests[payload.method] = [...(this.requests[payload.method] || []), payload]

    let result

    if (payload.method === 'eth_accounts') {
      result = ['0x58c99d4AfAd707268067d399d784c2c8a763B1De']
    } else if (payload.method === 'net_version') {
      result = '4'
    } else if (payload.method === 'eth_chainId') {
      result = '0x4'
    } else if (payload.method === 'eth_subscribe') {
      result = '0xsubscriptionid'
    }

    this.emit('payload', { id: payload.id, result })
  }
}

let connection, provider

beforeEach(async function () {
  connection = new TestConnection()
  provider = new EthereumProvider(connection)
  provider.once('chainChanged', () => {})

  await provider.enable()
  await provider.checkConnection()
})

describe('non-standard interface', () => {
  it('exposes the current chainId', function () { assert(provider.chainId === '0x4') })
  it('exposes the current network version', function () { assert(provider.networkVersion === '4') })
  it('exposes the currently selected account', function () { assert(provider.selectedAddress === '0x58c99d4AfAd707268067d399d784c2c8a763B1De') })
})

describe('omni-chain support', () => {
  it('adds the target chain to the payload of a request with no chain', async function () {
    provider.setChain('0x89')

    const req = {
      id: 1,
      method: 'eth_getBalance',
      params: ['0x58c99d4AfAd707268067d399d784c2c8a763B1De']
    }

    await provider.request(req)

    assert(connection.requests.eth_getBalance[0].chainId === '0x89')
  })

  it('does not overwrite the provided target chain', async function () {
    provider.setChain('0x89')

    const req = {
      id: 1,
      method: 'eth_getBalance',
      params: ['0x58c99d4AfAd707268067d399d784c2c8a763B1De'],
      chainId: '0x4'
    }

    await provider.request(req)

    assert(connection.requests.eth_getBalance[0].chainId === '0x4')
  })

  const validTransactionCases = [
    { name: 'updates a transaction with the target chain', targetChain: '0xa', txChain: undefined },
    { name: 'allows a transaction with the same chain id as the target chain', targetChain: '0x89', txChain: '0x89' },
    { name: 'allows a transaction with any chain id when no target chain is set', targetChain: undefined, txChain: '0xa4b1' }
  ]

  validTransactionCases.forEach(function ({ name, targetChain, txChain }) {
    it(name, async function () {
      const req = {
        id: 1,
        method: 'eth_sendTransaction',
        params: [{
          to: '0x58c99d4AfAd707268067d399d784c2c8a763B1De',
          value: '0x14d1120d7b160000'
        }]
      }

      if (targetChain) req.chainId = targetChain
      if (txChain) req.params[0].chainId = txChain

      await provider.request(req)

      const payloadChainId = connection.requests.eth_sendTransaction[0].chainId
      assert(payloadChainId === targetChain, `payload chainId was ${payloadChainId}`)

      const txChainId = connection.requests.eth_sendTransaction[0].params[0].chainId
      assert(txChainId === (targetChain || txChain), `tx chainId was ${txChainId}`)
    })
  })

  it('rejects a transaction with a chain id that does not match the target chain', async function () {
    const req = {
      id: 1,
      method: 'eth_sendTransaction',
      params: [{
        to: '0x58c99d4AfAd707268067d399d784c2c8a763B1De',
        value: '0x14d1120d7b160000',
        chainId: '0x4'
      }],
      chainId: '0xa'
    }

    try {
      await provider.request(req)
      fail('transactions with mismatched chains should not be allowed!')
    } catch (e) {
      assert(e.message.match(/inconsistent/))
    }
  })
})

describe('events', () => {
  describe('#chainChanged', () => {
    it('fires a chainChanged event when the chain changes from the connection', function (done) {
      provider.once('chainChanged', chainId => {
        assert(chainId === '0x89')
        done()
      })

      connection.emit('payload', { method: 'eth_subscription', params: { subscription: '0xsubscriptionid', result: '0x89' } })
    })

    it('does not fire a chainChanged event if the chain has been manually set', function (done) {
      provider.setChain('0x1')

      provider.once('chainChanged', () => done(new Error('provider chain should not have changed!')))

      connection.emit('payload', { method: 'eth_subscription', params: { subscription: '0xsubscriptionid', result: '0x89' } })

      done()
    })

    it('fires a chainChanged event when the chain is set manually', function (done) {
      provider.once('chainChanged', chainId => {
        assert(chainId === '0xa')
        done()
      })

      provider.setChain('0xa')
    })

    it('fires a chainChanged event when the manual chain is unset', function (done) {
      provider.setChain('0x1')

      provider.once('chainChanged', chainId => {
        assert(chainId === '0x4')
        done()
      })

      provider.setChain(undefined)
    })

    it('does not fire a chainChanged event if the chain is manually set to the same chain', function (done) {
      provider.once('chainChanged', () => done(new Error('chain should not have changed!')))

      provider.setChain('0x4')

      done()
    })
  })
})
