export function formatJPY(v) { return new Intl.NumberFormat('ja-JP').format(Math.round(v)) }

export function yenM(v) {
  if (Math.abs(v) >= 1_000_000) return `¥${(v/1_000_000).toFixed(1)}M`
  return `¥${formatJPY(v)}`
}

export function axisM(v) { return `¥${(v/1_000_000).toFixed(0)}M` }

export function displayVal(realVal, age, params) {
  if (!params.showNominal) return Math.round(realVal)
  return Math.round(realVal * Math.pow(1 + params.inflation / 100, age - params.startAge))
}
