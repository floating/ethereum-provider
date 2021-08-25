/* globals it describe beforeEach */

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised)

const expect = chai.expect

const { EventEmitter } = require('stream')
const EthereumProvider = require('../')

class TestConnection extends EventEmitter {
  constructor () {
    super()

    this.requestHandler = undefined
  }

  _connect () {
    this.emit('connect')
  }

  _close () {
    this.emit('close')
  }

  _setRequestHandler (handler) {
    this.requestHandler = handler
  }

  send (payload) {
    let response

    if (this.requestHandler) {
      response = this.requestHandler(payload)
    } else {
      if (payload.method === 'eth_accounts') {
        response = { result: ['0x58c99d4AfAd707268067d399d784c2c8a763B1De'] }
      } else if (payload.method === 'net_version') {
        response = { result: '4' }
      } else if (payload.method === 'eth_chainId') {
        response = { result: '0x4' }
      }
    }

    this.emit('payload', { id: payload.id, method: payload.method, ...response })
  }
}

let connection, provider

beforeEach(function () {
  connection = new TestConnection()
  provider = new EthereumProvider(connection)
})

describe('non-standard interface', function () {
  beforeEach(async function () {
    await provider.enable()
    await provider.checkConnection()
  })

  it('exposes the current chainId', () => assert(provider.chainId === '0x4'))
  it('exposes the current network version', () => assert(provider.networkVersion === '4'))
  it('exposes the currently selected account', () => assert(provider.selectedAddress === '0x58c99d4AfAd707268067d399d784c2c8a763B1De'))
})

describe('connecting', function () {
  this.timeout(200)

  it('emits an event when the connection becomes connected', function (done) {
    provider.once('connect', done)

    connection._connect()
  })

  it('emits an event when the connection closes', function (done) {
    provider.once('disconnect', done)

    connection._connect()
    connection._close()
  })
})

describe('sending requests', function () {
  beforeEach(function (done) {
    provider.once('connect', done)
    connection._connect()
  })
  
  it('handles a request with just a method', async function () {
    const accounts = ['0x58c99d4AfAd707268067d399d784c2c8a763B1De']
    connection._setRequestHandler(() => ({ result: accounts }))

    return expect(provider.send('eth_accounts')).to.become(accounts)
  })
  
  it.skip('handles a request with a method and params', async function () {
    const accounts = ['0x58c99d4AfAd707268067d399d784c2c8a763B1De']
    connection._setRequestHandler(() => ({ result: accounts }))

    return expect(provider.send('eth_accounts')).to.become(accounts)
  })
  
  it.skip('handles a request with a payload object', async function () {
    const accounts = ['0x58c99d4AfAd707268067d399d784c2c8a763B1De']
    connection._setRequestResponse({ result: accounts })

    return expect(provider.send('eth_accounts')).to.become(accounts)
  })
  
  it('responds with an error from the connection', async function () {
    connection._setRequestHandler(() => ({ error: 'Not Connected' }))

    return expect(provider.send('eth_accounts')).to.be.rejectedWith('Not Connected')
  })
})
