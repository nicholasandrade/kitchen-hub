/** Step position, shared by home and Cook Mode; not elapsed cooking time. */
export function cookingProgress(step: number, count: number) {
  return count > 0 ? Math.min(100, Math.max(0, ((step + 1) / count) * 100)) : 0
}
