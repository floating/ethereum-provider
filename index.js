const EventEmitter = require('events')

class EthereumProvider extends EventEmitter {
  constructor (connection) {
    super()

    this.enable = this.enable.bind(this)
    this._send = this._send.bind(this)
    this.send = this.send.bind(this)
    this._sendBatch = this._sendBatch.bind(this)
    this.subscribe = this.subscribe.bind(this)
    this.unsubscribe = this.unsubscribe.bind(this)
    this.sendAsync = this.sendAsync.bind(this)
    this.sendAsyncBatch = this.sendAsyncBatch.bind(this)
    this.isConnected = this.isConnected.bind(this)
    this.close = this.close.bind(this)
    this.request = this.request.bind(this)
    this.connected = false

    this.nextId = 1

    this.promises = {}
    this.subscriptions = []
    this.connection = connection
    this.connection.on('connect', () => this.checkConnection())
    this.connection.on('close', () => {
      this.connected = false
      this.emit('close')
      this.emit('disconnect')
    })
    this.connection.on('payload', payload => {
      const { id, method, error, result } = payload
      if (typeof id !== 'undefined') {
        if (this.promises[id]) { // Fulfill promise
          const requestMethod = this.promises[id].method
          if (requestMethod && ['eth_accounts', 'eth_requestAccounts'].includes(requestMethod)) {
            const accounts = result || []

            this.accounts = accounts
            this.selectedAddress = accounts[0]
            this.coinbase = accounts[0]
          }

          payload.error ? this.promises[id].reject(error) : this.promises[id].resolve(result)
          delete this.promises[id]
        }
      } else if (method && method.indexOf('_subscription') > -1) { // Emit subscription result
        // Events: connect, disconnect, chainChanged, accountsChanged, message
        this.emit(payload.params.subscription, payload.params.result)
        this.emit(method, payload.params) // Older EIP-1193
        this.emit('message', { // Latest EIP-1193
          type: payload.method,
          data: {
            subscription: payload.params.subscription,
            result: payload.params.result
          }
        })
        this.emit('data', payload) // Backwards Compatibility
      }
    })
    this.on('newListener', (event, listener) => {
      if (event === 'chainChanged' && !this.attemptedChainSubscription && this.connected) {
        this.startChainSubscription()
      } else if (event === 'accountsChanged' && !this.attemptedAccountsSubscription && this.connected) {
        this.startAccountsSubscription()
      } else if (event === 'networkChanged' && !this.attemptedNetworkSubscription && this.connected) {
        this.startNetworkSubscription()
        console.warn('The networkChanged event is being deprecated, use chainChainged instead')
      }
    })
  }

  async checkConnection (retry) {
    if (this.checkConnectionRunning || this.connected) return
    this.checkConnectionRunning = true
    try {
      this.networkVersion = await this._send('net_version', [], false)
      this.chainId = await this._send('eth_chainId', [], false)

      this.checkConnectionRunning = false
      this.connected = true
      this.emit('connect', { chainId: this.chainId })

      clearTimeout(this.checkConnectionTimer)

      if (this.listenerCount('networkChanged') && !this.attemptedNetworkSubscription) this.startNetworkSubscription()
      if (this.listenerCount('chainChanged') && !this.attemptedChainSubscription) this.startChainSubscription()
      if (this.listenerCount('accountsChanged') && !this.attemptedAccountsSubscription) this.startAccountsSubscription()
    } catch (e) {
      if (!retry) setTimeout(() => this.checkConnection(true), 1000)
      this.checkConnectionTimer = setInterval(() => this.checkConnection(true), 4000)
      this.checkConnectionRunning = false
      this.connected = false
    }
  }

  async startNetworkSubscription () {
    this.attemptedNetworkSubscription = true
    try {
      const networkChanged = await this.subscribe('eth_subscribe', 'networkChanged')
      this.on(networkChanged, netId => {
        this.networkVersion = netId
        this.emit('networkChanged', netId)
      })
    } catch (e) {
      console.warn('Unable to subscribe to networkChanged', e)
    }
  }

  async startChainSubscription () {
    this.attemptedChainSubscription = true
    try {
      const chainChanged = await this.subscribe('eth_subscribe', 'chainChanged')
      this.on(chainChanged, netId => {
        this.chainId = netId
        this.emit('chainChanged', netId)
      })
    } catch (e) {
      console.warn('Unable to subscribe to chainChanged', e)
    }
  }

  async startAccountsSubscription () {
    this.attemptedAccountsSubscription = true
    try {
      const accountsChanged = await this.subscribe('eth_subscribe', 'accountsChanged')
      this.on(accountsChanged, accounts => {
        this.selectedAddress = accounts[0]
        this.emit('accountsChanged', accounts)
      })
    } catch (e) {
      console.warn('Unable to subscribe to accountsChanged', e)
    }
  }

  enable () {
    return new Promise((resolve, reject) => {
      this._send('eth_accounts').then(accounts => {
        if (accounts.length > 0) {
          this.accounts = accounts
          this.selectedAddress = accounts[0]
          this.coinbase = accounts[0]

          this.emit('enable')

          resolve(accounts)
        } else {
          const err = new Error('User Denied Full Provider')
          err.code = 4001
          reject(err)
        }
      }).catch(reject)
    })
  }

  _send (method, params = [], waitForConnection = true) {
    const sendFn = (resolve, reject) => {
      let payload
      if (typeof method === 'object' && method !== null) {
        payload = method
        payload.params = payload.params || []
        payload.jsonrpc = '2.0'
        payload.id = this.nextId++
      } else {
        payload = { jsonrpc: '2.0', id: this.nextId++, method, params }
      }

      this.promises[payload.id] = { resolve, reject, method }
      if (!payload.method || typeof payload.method !== 'string') {
        this.promises[payload.id].reject(new Error('Method is not a valid string.'))
        delete this.promises[payload.id]
      } else {
        this.connection.send(payload)
      }
    }

    if (this.connected || !waitForConnection) {
      return new Promise(sendFn)
    }

    return new Promise((resolve, reject) => {
      const resolveSend = () => {
        clearTimeout(disconnectTimer)
        return resolve(new Promise(sendFn))
      }

      const disconnectTimer = setTimeout(() => {
        this.off('connect', resolveSend)
        reject(new Error('Not connected'))
      }, 5000)

      this.once('connect', resolveSend)
    })
  }

  send (methodOrPayload, callbackOrArgs) { // Send can be clobbered, proxy sendPromise for backwards compatibility
    if (
      typeof methodOrPayload === 'string' &&
      (!callbackOrArgs || Array.isArray(callbackOrArgs))
    ) {
      return this._send(methodOrPayload, callbackOrArgs)
    }

    if (
      methodOrPayload &&
      typeof methodOrPayload === 'object' &&
      typeof callbackOrArgs === 'function'
    ) {
      // a callback was passed to send(), forward everything to sendAsync()
      return this.sendAsync(methodOrPayload, callbackOrArgs)
    }

    return this.request(methodOrPayload)
  }

  _sendBatch (requests) {
    return Promise.all(requests.map(payload => this._send(payload.method, payload.params)))
  }

  subscribe (type, method, params = []) {
    return this._send(type, [method, ...params]).then(id => {
      this.subscriptions.push(id)
      return id
    })
  }

  unsubscribe (type, id) {
    return this._send(type, [id]).then(success => {
      if (success) {
        this.subscriptions = this.subscriptions.filter(_id => _id !== id) // Remove subscription
        this.removeAllListeners(id) // Remove listeners
        return success
      }
    })
  }

  sendAsync (payload, cb) { // Backwards Compatibility
    if (!cb || typeof cb !== 'function') return cb(new Error('Invalid or undefined callback provided to sendAsync'))
    if (!payload) return cb(new Error('Invalid Payload'))
    // sendAsync can be called with an array for batch requests used by web3.js 0.x
    // this is not part of EIP-1193's backwards compatibility but we still want to support it
    payload.jsonrpc = '2.0'

    if (Array.isArray(payload)) {
      return this.sendAsyncBatch(payload, cb)
    } else {
      return this._send(payload.method, payload.params).then(result => {
        cb(null, { id: payload.id, jsonrpc: payload.jsonrpc, result })
      }).catch(err => {
        cb(err)
      })
    }
  }

  sendAsyncBatch (payload, cb) {
    return this._sendBatch(payload).then((results) => {
      const result = results.map((entry, index) => {
        return { id: payload[index].id, jsonrpc: payload[index].jsonrpc, result: entry }
      })
      cb(null, result)
    }).catch(err => {
      cb(err)
    })
  }

  // _sendSync (payload) {
  //   let result

  //   switch (payload.method) {
  //     case 'eth_accounts':
  //       result = this.selectedAddress ? [this.selectedAddress] : []
  //       break

  //     case 'eth_coinbase':
  //       result = this.selectedAddress || null
  //       break

  //     case 'eth_uninstallFilter':
  //       this._send(payload)
  //       result = true

  //     case 'net_version':
  //       result = this.networkVersion || null
  //       break

  //     default:
  //       throw new Error(`unsupported method ${payload.method}`)
  //   }

  //   return {
  //     id: payload.id,
  //     jsonrpc: payload.jsonrpc,
  //     result
  //   }
  // }

  isConnected () { // Backwards Compatibility
    return this.connected
  }

  close () {
    if (this.connection && this.connection.close) this.connection.close()
    this.connected = false
    const error = new Error('Provider closed, subscription lost, please subscribe again.')
    this.subscriptions.forEach(id => this.emit(id, error)) // Send Error objects to any open subscriptions
    this.subscriptions = [] // Clear subscriptions

    this.chainId = undefined
    this.networkVersion = undefined
    this.selectedAddress = undefined
  }

  request (payload) {
    return this._send(payload.method, payload.params)
  }
}

module.exports = EthereumProvider
