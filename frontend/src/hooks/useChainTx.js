import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { network } from '../config/network'
import { syncTx } from '../lib/api'

/**
 * Sends a contract write on the configured Arc network:
 * switches chain if needed → asks the wallet to sign → waits for the receipt
 * (Arc finalizes in under a second) → tells the API to index it → refreshes queries.
 */
export function useChainTx() {
  const { chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: network.chain.id })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(null) // label of the step in progress

  const ensureChain = useCallback(async () => {
    if (chainId !== network.chain.id) {
      await switchChainAsync({ chainId: network.chain.id })
    }
  }, [chainId, switchChainAsync])

  const send = useCallback(
    async (request, label = 'Confirm in your wallet') => {
      setPending(label)
      try {
        await ensureChain()
        const hash = await writeContractAsync({ ...request, chainId: network.chain.id })
        setPending('Settling on Arc…')
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('The transaction was reverted on-chain.')
        await syncTx(hash)
        await queryClient.invalidateQueries()
        return { hash, receipt }
      } finally {
        setPending(null)
      }
    },
    [ensureChain, writeContractAsync, publicClient, queryClient],
  )

  return { send, pending, ensureChain, wrongChain: chainId !== undefined && chainId !== network.chain.id }
}
