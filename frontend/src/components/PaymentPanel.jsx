import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { skillPay, usdc } from '../contracts'
import { network, explorerTx } from '../config/network'
import { useChainTx } from '../hooks/useChainTx'
import { useToast } from '../hooks/useToast'
import { formatUsdc, friendlyError } from '../lib/format'
import { TxLink } from './common'

/**
 * Checkout for one course. Reads price, fee and the student's state straight from
 * the contract, so what the student signs always matches the chain.
 */
export default function PaymentPanel({ course }) {
  const { address, isConnected } = useAccount()
  const { send, pending, wrongChain } = useChainTx()
  const toast = useToast()
  const [lastTx, setLastTx] = useState(null)
  const id = BigInt(course.onchainId)

  const { data: quote, isLoading: quoting } = useReadContract({
    ...skillPay,
    functionName: 'quote',
    args: [id],
    query: { refetchInterval: 20_000 },
  })
  const { data: feeBps } = useReadContract({ ...skillPay, functionName: 'feeBps' })
  const { data: userState, refetch } = useReadContracts({
    contracts: [
      { ...skillPay, functionName: 'isEnrolled', args: [id, address] },
      { ...usdc, functionName: 'balanceOf', args: [address] },
      { ...usdc, functionName: 'allowance', args: [address, skillPay.address] },
    ],
    query: { enabled: Boolean(address) },
  })

  const [price, fee, tutorAmount] = quote || []
  const enrolled = userState?.[0]?.result === true
  const balance = userState?.[1]?.result
  const allowance = userState?.[2]?.result
  const isOwnCourse = address && course.tutor?.address === address.toLowerCase()
  const needsApproval = price !== undefined && allowance !== undefined && allowance < price
  const lowBalance = price !== undefined && balance !== undefined && balance < price

  async function pay() {
    try {
      if (needsApproval) {
        await send({ ...usdc, functionName: 'approve', args: [skillPay.address, price] }, 'Approve USDC in your wallet')
      }
      const { hash } = await send(
        { ...skillPay, functionName: 'enroll', args: [id, price] },
        'Confirm the payment in your wallet',
      )
      setLastTx(hash)
      await refetch()
      toast.success('You’re enrolled', {
        body: `${formatUsdc(price)} USDC paid. ${formatUsdc(tutorAmount)} went straight to your tutor.`,
        href: explorerTx(hash),
      })
    } catch (e) {
      toast.error('Payment didn’t go through', { body: friendlyError(e) })
    }
  }

  const feePct = feeBps !== undefined ? Number(feeBps) / 100 : null

  return (
    <aside className="pay-panel" aria-label="Enroll in this course">
      <p className="pay-price">
        {price !== undefined ? formatUsdc(price) : course.price || '—'} <span>USDC</span>
      </p>
      <p className="pay-sub">One-time payment. Lifetime access to every lesson.</p>

      <dl className="pay-breakdown">
        <div>
          <dt>Tutor receives</dt>
          <dd>{tutorAmount !== undefined ? `${formatUsdc(tutorAmount)} USDC` : '—'}</dd>
        </div>
        <div>
          <dt>Platform fee{feePct !== null ? ` (${feePct}%)` : ''}</dt>
          <dd>{fee !== undefined ? `${formatUsdc(fee)} USDC` : '—'}</dd>
        </div>
        <div>
          <dt>Network fee</dt>
          <dd>Under 0.01 USDC</dd>
        </div>
      </dl>

      {enrolled || isOwnCourse ? (
        <>
          <Link to={`/learn/${course.id}`} className="btn btn-primary btn-block">
            {isOwnCourse ? 'Preview your course' : 'Start learning'}
          </Link>
          {lastTx && (
            <p className="pay-receipt">
              Payment settled. <TxLink hash={lastTx}>View receipt on Arcscan</TxLink>
            </p>
          )}
        </>
      ) : !isConnected ? (
        <p className="pay-hint">Connect your wallet at the top of the page to enroll.</p>
      ) : !course.active ? (
        <p className="pay-hint">This course isn’t taking new students right now.</p>
      ) : (
        <>
          <button
            className="btn btn-primary btn-block"
            onClick={pay}
            disabled={Boolean(pending) || quoting || price === undefined || lowBalance}
          >
            {pending
              ? pending
              : wrongChain
                ? `Switch to ${network.chain.name} and pay`
                : needsApproval
                  ? `Approve and pay ${formatUsdc(price)} USDC`
                  : `Pay ${price !== undefined ? formatUsdc(price) : ''} USDC`}
          </button>
          {needsApproval && !pending && (
            <p className="pay-hint">Your wallet will ask twice: once to allow this exact amount, then to pay.</p>
          )}
          {lowBalance && (
            <p className="pay-hint pay-hint-warn">
              Your wallet has {formatUsdc(balance)} USDC.{' '}
              {network.faucet ? (
                <a href={network.faucet} target="_blank" rel="noreferrer">
                  Get test USDC
                </a>
              ) : (
                'Add USDC on Arc to enroll.'
              )}
            </p>
          )}
        </>
      )}
    </aside>
  )
}
