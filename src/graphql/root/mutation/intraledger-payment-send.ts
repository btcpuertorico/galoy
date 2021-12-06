import { getUsernameFromWalletPublicId } from "@app/users"
import { intraledgerPaymentSendUsername } from "@app/wallets"
import { checkedToWalletPublicId } from "@domain/wallets"
import { mapError } from "@graphql/error-map"
import { GT } from "@graphql/index"
import PaymentSendPayload from "@graphql/types/payload/payment-send"
import Memo from "@graphql/types/scalar/memo"
import SatAmount from "@graphql/types/scalar/sat-amount"
import WalletId from "@graphql/types/scalar/wallet-id"
import { WalletsRepository } from "@services/mongoose"

const IntraLedgerPaymentSendInput = new GT.Input({
  name: "IntraLedgerPaymentSendInput",
  fields: () => ({
    walletId: { type: GT.NonNull(WalletId) }, // TODO: rename senderWalletId
    recipientWalletId: { type: GT.NonNull(WalletId) },
    amount: { type: GT.NonNull(SatAmount) },
    memo: { type: Memo },
  }),
})

const IntraLedgerPaymentSendMutation = GT.Field({
  type: GT.NonNull(PaymentSendPayload),
  args: {
    input: { type: GT.NonNull(IntraLedgerPaymentSendInput) },
  },
  resolve: async (_, args, { user, logger }) => {
    const { walletId, recipientWalletId, amount, memo } = args.input
    for (const input of [walletId, recipientWalletId, amount, memo]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    const senderWalletPublicId = checkedToWalletPublicId(walletId)
    if (senderWalletPublicId instanceof Error) {
      const appErr = mapError(senderWalletPublicId)
      return { errors: [{ message: appErr.message }] }
    }

    const recipientWalletPublicId = checkedToWalletPublicId(recipientWalletId)
    if (recipientWalletPublicId instanceof Error) {
      const appErr = mapError(recipientWalletPublicId)
      return { errors: [{ message: appErr.message }] }
    }

    // FIXME: this logic below should be in app/ not graphql/
    const senderWallet = await WalletsRepository().findByPublicId(senderWalletPublicId)
    if (senderWallet instanceof Error) {
      const appErr = mapError(senderWallet)
      return { errors: [{ message: appErr.message }] }
    }

    // TODO: recipientUsername should become optional for IntraLedgerPaymentSendInput
    const recipientUsername = await getUsernameFromWalletPublicId(recipientWalletPublicId)
    if (recipientUsername instanceof Error) {
      const appErr = mapError(recipientUsername)
      return { errors: [{ message: appErr.message }] }
    }

    const status = await intraledgerPaymentSendUsername({
      recipientUsername,
      memo,
      amount,
      payerWalletId: senderWallet.id,
      payerUserId: user.id,
      logger,
    })
    if (status instanceof Error) {
      const appErr = mapError(status)
      return { status: "failed", errors: [{ message: appErr.message }] }
    }

    return {
      errors: [],
      status: status.value,
    }
  },
})

export default IntraLedgerPaymentSendMutation
