import EventEmitter from 'events'
import type { Payload } from './payload'

export interface RequestArguments {
  method: string
  params?: readonly unknown[] | object
}

export type Response = {
  jsonrpc: '2.0'
  id: number
  result: unknown
}

export type ProviderError = {
  code: number
  data?: unknown
}

export type EventHandler = (eventPayload: unknown) => void

export type Callback<T> = (err: Error | null, result?: T) => void

export type PendingPromise = {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  method: string
}

export interface Connection extends EventEmitter {
  send: (payload: Payload) => Promise<void>
  close: () => void
}

export interface EthereumProvider {
  request (payload: RequestArguments): Promise<unknown>
  on: (event: string, cb: (data: any) => void) => void
  removeListener: (event: string, handler: (data: any) => void) => void
}
