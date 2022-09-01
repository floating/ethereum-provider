export type Payload = {
  method: string
  params: any[]
  jsonrpc: '2.0'
  id: number
  chainId?: string
}

export function isChainMismatch (payload: Payload) {
  const tx = payload.params[0] || {}

  return ('chainId' in tx) && parseInt(tx.chainId) !== parseInt(payload.chainId || '')
}

export function updatePayloadChain (payload: Payload) {
  const tx = payload.params[0] || {}

  return { ...payload, params: [{ ...tx, chainId: payload.chainId }, ...payload.params.slice(1)]}
}
