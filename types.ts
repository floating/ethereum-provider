import EventEmitter from 'events'
import type { JsonRpcPayload } from './payload'

// EIP-1193 interface types
export interface RequestArguments {
  method: string
  params?: readonly unknown[] | object
}

export type ProviderError = {
  code: number
  data?: unknown
}

export interface EthereumProvider {
  request (payload: RequestArguments): Promise<unknown>
  on: (event: string, cb: (data: unknown) => void) => void
  removeListener: (event: string, handler: (data: unknown) => void) => void
}

// JSON RPC types
export type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: number
  result: unknown
}

// internal types
export type EventHandler = (eventPayload: unknown) => void

export type Callback<T> = (err: Error | null, result?: T) => void

export type PendingPromise = {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  method: string
}

export interface Connection extends EventEmitter {
  send: (payload: JsonRpcPayload) => Promise<void>
  close: () => void
}
