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
    let response = (!!this.requestHandler && this.requestHandler(payload))

    if (!response) {
      if (payload.method === 'eth_chainId') response = { result: '0x4' }
      else if (payload.method === 'net_version') response = { result: '4' }
      else response = { error: 'unsupported request' }
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
  this.timeout(500)

  beforeEach(function (done) {
    connection._setRequestHandler(payload => {
      if (payload.method === 'eth_accounts') {
        return { result: ['0x58c99d4AfAd707268067d399d784c2c8a763B1De'] }
      }
    })

    provider.once('connect', () => provider.enable())
    provider.once('enable', done)

    connection._connect()
  })

  it('exposes the current chainId', () => expect(provider.chainId).to.equal('0x4'))
  it('exposes the current network version', () => expect(provider.networkVersion).to.equal('4'))
  it('exposes the currently selected account', () => expect(provider.selectedAddress).to.equal('0x58c99d4AfAd707268067d399d784c2c8a763B1De'))
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

    connection._setRequestHandler(payload => 
      (payload.method === 'eth_accounts' && payload.params.length === 0)
      ? { result: accounts }
      : { error: 'unsupported method' }
    )

    return expect(provider.send('eth_accounts')).to.become(accounts)
  })
  
  it('handles a request with a method and params', async function () {
    const block = '0x1b4'

    connection._setRequestHandler(payload => 
      (payload.method === 'eth_getBlockByNumber' &&
        payload.params[0] === 'latest' &&
        payload.params[1] === true)
      ? { result: block }
      : { error: 'unsupported method' }
    )

    return expect(provider.send('eth_getBlockByNumber', ['latest', true])).to.become(block)
  })
  
  it('handles a request with a payload object', async function () {
    const block = '0x1b4'
    const request = { method: 'eth_getBlockByNumber', params: ['latest', true] }

    connection._setRequestHandler(payload => 
      (payload.method === 'eth_getBlockByNumber' &&
        payload.params[0] === 'latest' &&
        payload.params[1] === true)
      ? { result: block }
      : { error: 'unsupported method' }
    )

    return expect(provider.send(request)).to.become(block)
  })
  
  it('responds with an error from the connection', async function () {
    connection._setRequestHandler(() => ({ error: 'Not Connected' }))

    return expect(provider.send('eth_accounts')).to.be.rejectedWith('Not Connected')
  })
})
