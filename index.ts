import EventEmitter from 'events'
import { isChainMismatch, Payload, updatePayloadChain } from './payload'
import type { Callback, Connection, EventHandler, PendingPromise, Response } from './types'

class EthereumProvider extends EventEmitter {
  private readonly connection: Connection

  private readonly eventHandlers: Record<string, EventHandler>
  private readonly promises: Record<string, PendingPromise> = {}
  private subscriptions: string[] = []
  private readonly attemptedSubscriptions: Record<string, boolean> = {}

  private networkVersion?: number
  private manualChainId?: string
  private providerChainId?: string

  private connected = false
  private checkConnectionRunning = false
  private checkConnectionTimer?: NodeJS.Timer
  private nextId = 1

  accounts: string[] = []
  selectedAddress = ''
  coinbase = ''

  constructor (connection: Connection) {
    super()

    this.enable = this.enable.bind(this)
    this.doSend = this.doSend.bind(this)
    this.send = this.send.bind(this)
    this.sendBatch = this.sendBatch.bind(this)

    this.subscribe = this.subscribe.bind(this)
    this.unsubscribe = this.unsubscribe.bind(this)
    this.resumeSubscriptions = this.resumeSubscriptions.bind(this)

    this.sendAsync = this.sendAsync.bind(this)
    this.sendAsyncBatch = this.sendAsyncBatch.bind(this)
    this.isConnected = this.isConnected.bind(this)
    this.close = this.close.bind(this)
    this.request = this.request.bind(this)

    this.connection = connection

    this.on('connect', this.resumeSubscriptions)

    this.connection.on('connect', () => this.checkConnection(1000))
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
        // Events: connect, disconnect, chainChanged, chainsChanged, accountsChanged, assetsChanged, message
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

    this.on('newListener', event => {
      if (Object.keys(this.eventHandlers).includes(event)) {
        if (!this.attemptedSubscription(event) && this.connected) {
          this.startSubscription(event)

          if (event === 'networkChanged') {
            console.warn('The networkChanged event is being deprecated, use chainChanged instead')
          }
        }
      }
    })

    this.eventHandlers = {
      networkChanged: netId => {
        this.networkVersion = (typeof netId === 'string') ? parseInt(netId) : netId

        this.emit('networkChanged', this.networkVersion)
      },
      chainChanged: chainId => {
        this.providerChainId = chainId

        if (!this.manualChainId) {
          this.emit('chainChanged', chainId)
        }
      },
      chainsChanged: chains => {
        this.emit('chainsChanged', chains)
      },
      accountsChanged: accounts => {
        this.selectedAddress = accounts[0]
        this.emit('accountsChanged', accounts)
      },
      assetsChanged: assets => {
        this.emit('assetsChanged', assets)
      }
    }
  }

  get chainId () {
    return this.manualChainId || this.providerChainId
  }

  async checkConnection (retryTimeout = 4000) {
    if (this.checkConnectionRunning || this.connected) return

    clearTimeout(this.checkConnectionTimer)

    this.checkConnectionTimer = undefined
    this.checkConnectionRunning = true

    try {
      this.networkVersion = await this.doSend('net_version', [], undefined, false)
      this.providerChainId = await this.doSend('eth_chainId', [], undefined, false)

      this.connected = true
    } catch (e) {
      this.checkConnectionTimer = setTimeout(() => this.checkConnection(), retryTimeout)

      this.connected = false
    } finally {
      this.checkConnectionRunning = false

      if (this.connected) {
        this.emit('connect', { chainId: this.providerChainId })
      }
    }
  }

  private attemptedSubscription (event: string) {
    return !!this.attemptedSubscriptions[event]
  }

  private setSubscriptionAttempted (event: string) {
    this.attemptedSubscriptions[event] = true
  }

  async startSubscription (event: string) {
    console.debug(`starting subscription for ${event} events`)

    this.setSubscriptionAttempted(event)

    try {
      const eventId = await (this.subscribe('eth_subscribe', event)) as string

      this.on(eventId, this.eventHandlers[event])
    } catch (e) {
      console.warn(`Unable to subscribe to ${event}`, e)
    }
  }

  private resumeSubscriptions () {
    Object.keys(this.eventHandlers).forEach(event => {
      if (this.listenerCount(event) && !this.attemptedSubscription(event)) this.startSubscription(event)
    })
  }

  async enable () {
    const accounts = await (<Promise<string[]>>this.doSend('eth_accounts'))

    if (accounts.length > 0) {
      this.accounts = accounts
      this.selectedAddress = accounts[0]
      this.coinbase = accounts[0]

      this.emit('enable')

      return accounts
    } else {
      const err = new Error('User Denied Full Provider')

      // @ts-ignore
      err.code = 4001
      throw err
    }
  }

  private doSend <T> (method: string, params: any[] = [], targetChain = this.manualChainId, waitForConnection = true): Promise<T> {
    const sendFn = (resolve: (result: any) => void, reject: (err: Error) => void) => {
      let payload: Payload
      if (typeof method === 'object' && method !== null) {
        payload = method
        payload.params = payload.params || []
        payload.jsonrpc = '2.0'
        payload.id = this.nextId++
      } else {
        payload = { jsonrpc: '2.0', id: this.nextId++, method, params }
      }

      if (!payload.method || typeof payload.method !== 'string') {
        return reject(new Error('Method is not a valid string.'))
      }

      if (targetChain) {
        if (!('chainId' in payload)) payload.chainId = targetChain

        if (payload.method === 'eth_sendTransaction') {
          const mismatchedChain = isChainMismatch(payload)
          if (mismatchedChain) {
            return reject(new Error(`Payload chainId (${mismatchedChain}) inconsistent with specified target chainId: ${targetChain}`))
          }

          payload = updatePayloadChain(payload)
        }
      }

      this.promises[payload.id] = { resolve, reject, method }
      this.connection.send(payload)
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

  async send (methodOrPayload: string | Payload, callbackOrArgs: Callback<Response> | any[]) { // Send can be clobbered, proxy sendPromise for backwards compatibility
    if (
      typeof methodOrPayload === 'string' &&
      (!callbackOrArgs || Array.isArray(callbackOrArgs))
    ) {
      const params = callbackOrArgs as any[]
      return this.doSend(methodOrPayload, params)
    }

    if (
      methodOrPayload &&
      typeof methodOrPayload === 'object' &&
      typeof callbackOrArgs === 'function'
    ) {
      // a callback was passed to send(), forward everything to sendAsync()
      const cb = callbackOrArgs as Callback<Response>
      return this.sendAsync(methodOrPayload, cb)
    }

    return this.request(methodOrPayload as Payload)
  }

  private sendBatch (requests: Payload[]): Promise<any[]> {
    return Promise.all(requests.map(payload => {
      return this.doSend(payload.method, payload.params)
    }))
  }

  async subscribe (type: string, method: string, params = []) {
    const id = <string>(await this.doSend(type, [method, ...params]))

    this.subscriptions.push(id)

    return id
  }

  async unsubscribe (type: string, id: string) {
    const success = <boolean>(await this.doSend(type, [id]))

    if (success) {
      this.subscriptions = this.subscriptions.filter(_id => _id !== id) // Remove subscription
      this.removeAllListeners(id) // Remove listeners
      return success
    }
  }

  async sendAsync (payload: Payload, cb: Callback<Response> | Callback<Response[]>) { // Backwards Compatibility
    if (!cb || typeof cb !== 'function') return new Error('Invalid or undefined callback provided to sendAsync')

    if (!payload) return cb(new Error('Invalid Payload'))
    // sendAsync can be called with an array for batch requests used by web3.js 0.x
    // this is not part of EIP-1193's backwards compatibility but we still want to support it
    payload.jsonrpc = '2.0'

    if (Array.isArray(payload)) {
      const callback = cb as Callback<Response[]>
      return this.sendAsyncBatch(payload, callback)
    } else {
      const callback = cb as Callback<Response>

      try {
        const result = <any>(await this.doSend(payload.method, payload.params))
        callback(null, { id: payload.id, jsonrpc: payload.jsonrpc, result })
      } catch (e: any) {
        callback(e as Error)
      }
    }
  }

  private async sendAsyncBatch (payloads: Payload[], cb: (err: Error | null, result?: Response[]) => void) {
    try {
      const results = await this.sendBatch(payloads)

      const result = results.map((entry, index) => {
        return { id: payloads[index].id, jsonrpc: payloads[index].jsonrpc, result: entry }
      })
      
      cb(null, result)
    } catch (e: any) {
      cb(e as Error)
    }
  }

  isConnected () { // Backwards Compatibility
    return this.connected
  }

  close () {
    if (this.connection && this.connection.close) this.connection.close()
    this.off('connect', this.resumeSubscriptions)
    this.connected = false

    const error = new Error('Provider closed, subscription lost, please subscribe again.')
    this.subscriptions.forEach(id => this.emit(id, error)) // Send Error objects to any open subscriptions
    this.subscriptions = [] // Clear subscriptions

    this.manualChainId = undefined
    this.providerChainId = undefined
    this.networkVersion = undefined
    this.selectedAddress = ''
  }

  async request (payload: Payload) {
    return this.doSend(payload.method, payload.params, payload.chainId)
  }

  setChain (chainId: string | number) {
    if (typeof chainId === 'number') chainId = '0x' + chainId.toString(16)

    const chainChanged = (chainId !== this.chainId)

    this.manualChainId = chainId

    if (chainChanged) {
      this.emit('chainChanged', this.chainId)
    }
  }
}

export default EthereumProvider
