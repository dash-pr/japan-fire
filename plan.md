# Japan FatFIRE Optimizer — Fix Plan

## Critical Bugs (Fix First)

### C1: Mortgage payment not deflated to real terms
- **File:** `src/simulation.js` lines 159-331
- **Problem:** Model claims "Real 2026 yen" but nominal fixed mortgage payment (306k/mo) is never divided by `(1+inflation)^(age-startAge)`. At age 50 this overstates real housing cost by ~33% (67k/mo), inflating FatFIRE target by ~26M yen.
- **Fix:** Pass inflation into the sim loop. Compute `realMortgagePayment = nominalPayment / (1+inflation)^(age-startAge)` each year. Use this for housing cost and expense calculations. Replicate in `monteCarlo.js`.

### C2: marginalRate() returns incorrect values for iDeCo tax savings
- **File:** `src/simulation.js` lines 24-29
- **Problem:** Returns 43% at 650k net. Actual combined marginal (income tax 20% + reconstruction 2.1% on that + residence tax 10%) is ~30.4%. Overstates annual iDeCo saving by 34,700 yen.
- **Fix:** Replace with proper bracket-based calculation. Use `computeIncomeTax` (currently dead code) to derive actual marginal rate from estimated gross income. Account for employment income deduction and basic deduction.

### C3: FatFIRE target excludes residence tax
- **File:** `src/simulation.js` line 289
- **Problem:** `totalExpenses` doesn't include `residenceTax`. In retirement, some residence tax still applies to investment income.
- **Fix:** Add a retirement residence tax estimate to the FatFIRE target calculation. During accumulation, include current residence tax in the target; during retirement, use a reduced estimate based on withdrawal income.

---

## High Severity (Fix Second)

### H1: Nenkin toggle is cosmetic only
- **File:** `src/FatFIREOptimizer.jsx` lines 1477-1478
- **Problem:** `showNenkin` only shows annotations. Does NOT reduce drawdown withdrawals from age 65.
- **Fix:** When nenkin is enabled, reduce annual withdrawal by nenkin amount (user-settable, default ~175k/mo) from age 65 onward in the simulation loop.

### H2: No capital gains tax drag on taxable account
- **File:** `src/simulation.js` lines 252-255
- **Problem:** All accounts use same `realReturn`. Taxable should use `realReturn * (1 - 0.20315)`.
- **Fix:** Apply tax-adjusted return to taxable account only: `taxable = taxable * (1 + realReturn * (1 - 0.20315)) + taxableContrib`.

### H3: App unusable on mobile
- **File:** `src/FatFIREOptimizer.jsx` line 1345
- **Problem:** Fixed 288px sidebar with no responsive breakpoint.
- **Fix:** Add responsive classes: sidebar hidden on mobile with hamburger toggle, shown on `lg:` breakpoint.

### H4: Home loan deduction not deflated
- **File:** `src/simulation.js` line 233
- **Problem:** Nominal 17,500/mo used as-is in real-terms model.
- **Fix:** `homeLoanDeduction = 17500 / (1+inflation)^(age-startAge)`.

### H5: Simulation logic duplicated in monteCarlo.js
- **File:** `src/monteCarlo.js` lines 22-118
- **Problem:** Entire sim loop reimplemented. Bug fixes must be manually replicated.
- **Fix:** Refactor `runSimulation` to accept a per-year return override (callback or array). Monte Carlo passes randomized returns instead of duplicating logic.

---

## Medium Severity (Fix Third)

### M1: Progress tracker NaN/100% when FIRE not reached
- **Fix:** Guard division: if `baseFireTarget <= 0`, show "N/A" or 0%.

### M2: Toggle not keyboard-accessible
- **Fix:** Change to `<button role="switch">` with `aria-checked`, handle Enter/Space keys.

### M3: Scenario lines color-only differentiation
- **Fix:** Add `strokeDasharray` patterns: bull=solid, base="8 4", bear="4 4", custom="2 2 6 2".

### M4: Applied cuts not reset on expense change
- **Fix:** Add `useEffect` that clears `appliedCuts` when relevant params change.

### M5: Form controls lack label associations
- **Fix:** Generate unique IDs and wire `htmlFor`/`id` on SliderRow and MoneyInput.

### M6: No error boundary
- **Fix:** Add `ErrorBoundary` component wrapping tab content.

### M7: Dead `computeIncomeTax()` code
- **Fix:** Remove if unused, or integrate into the new marginalRate replacement (C2).

---

## Low Severity (Cleanup Pass)

- **L1:** Rate hike condition `age > purchaseAge` should be `age >= purchaseAge`
- **L2:** Scenario comparison sensitivity table should include lifeEvents/bridgePhase in deps
- **L3:** Invalidate MC results when params change (show "stale" indicator)
- **L4:** Persist appliedCuts in URL state
- **L5:** Visual distinction for drawdown phase (lighter color or shading after FIRE)
- **L6:** MoneyInput: reject negative values
- **L7:** Remove cosmetic-only custom scenario inflation param (or use it)
- **L8:** Budget investable estimate should use `computeResidenceTax()`

---

## Implementation Order (Parallel Batches)

**Batch 1 (can be parallel):**
- C1 + H4 (both deflation fixes in simulation.js)
- C2 + M7 (marginal rate fix, uses dead code)
- H2 (taxable account tax drag)

**Batch 2 (depends on Batch 1):**
- H5 (refactor MC to reuse simulation.js — needs C1/C2/H2 done first)
- C3 (residence tax in target)
- H1 (nenkin implementation)

**Batch 3 (UI, independent):**
- H3 (responsive layout)
- M1, M2, M3, M4, M5, M6 (UI/UX fixes)

**Batch 4 (cleanup):**
- L1-L8 (low severity fixes)
