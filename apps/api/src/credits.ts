import type { Prisma } from "@prisma/client";

export const initialCreditBalance = 5;
export const diagnosisCreditCost = 1;

export async function chargeDiagnosisCredit(tx: Prisma.TransactionClient, userId: string) {
  const charged = await tx.user.updateMany({
    where: { id: userId, creditBalance: { gte: diagnosisCreditCost } },
    data: { creditBalance: { decrement: diagnosisCreditCost } }
  });
  return charged.count === 1;
}

export async function refundDecisionRunCredit(
  tx: Prisma.TransactionClient,
  input: { runId: string; userId: string; status: "RUNNING"; leaseOwner: string }
) {
  const refundable = await tx.decisionRun.updateMany({
    where: {
      id: input.runId,
      status: input.status,
      leaseOwner: input.leaseOwner,
      creditCharged: true,
      creditRefunded: false
    },
    data: { creditRefunded: true }
  });
  if (refundable.count !== 1) return false;
  await tx.user.update({ where: { id: input.userId }, data: { creditBalance: { increment: diagnosisCreditCost } } });
  return true;
}
