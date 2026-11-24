export function formatGrowthAmount(currency: 'INR' | 'USD', totalMinor: string) {
  const amount = BigInt(totalMinor);
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).formatToParts(amount / 100n)
    .map((part) => part.type === 'fraction' ? String(amount % 100n).padStart(2, '0') : part.value).join('');
}
