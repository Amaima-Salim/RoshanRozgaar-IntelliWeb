/** Money is integer PKR, shown as "Rs 1,500" with Western digits in both languages (docs/03 §3). */
export function formatPkr(amount: number): string {
  if (!Number.isInteger(amount)) throw new Error("PKR amounts are integers");
  return `Rs ${new Intl.NumberFormat("en-PK").format(amount)}`;
}
