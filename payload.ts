export type Payload = {
  readonly method: string
  readonly params: readonly any[]
  readonly jsonrpc: '2.0'
  readonly id: number
  chainId?: string
}

export function create (method: string, params: readonly any[] = [], id: number, targetChain?: string): Payload {
  const payload: Payload = {
    id, method, params, jsonrpc: '2.0'
  }

  if (targetChain) {
    payload.chainId = targetChain
  }

  if (payload.method === 'eth_sendTransaction') {
    const mismatchedChain = isChainMismatch(payload)
    if (mismatchedChain) {
      throw new Error(`Payload chainId (${mismatchedChain}) inconsistent with specified target chainId: ${targetChain}`)
    }

    return updatePayloadChain(payload)
  }

  return payload
}

function isChainMismatch (payload: Payload) {
  if (payload.method !== 'eth_sendTransaction') return false

  const tx = payload.params[0] || {}

  return ('chainId' in tx) && parseInt(tx.chainId) !== parseInt(payload.chainId || tx.chainId)
}

function updatePayloadChain (payload: Payload) {
  const tx = payload.params[0] || {}

  return { ...payload, params: [{ ...tx, chainId: tx.chainId || payload.chainId }, ...payload.params.slice(1)]}
}
