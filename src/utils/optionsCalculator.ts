export function calculatePCRatio(trades: any[]): number {
  const putVolume = trades
    .filter(trade => trade.type === 'P')
    .reduce((sum, trade) => sum + trade.quantity, 0);

  const callVolume = trades
    .filter(trade => trade.type === 'C')
    .reduce((sum, trade) => sum + trade.quantity, 0);

  return callVolume === 0 ? 0 : putVolume / callVolume;
}