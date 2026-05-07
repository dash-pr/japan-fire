import { useMemo } from 'react'
import { runSimulation } from '../simulation.js'

/**
 * Hook that runs the simulation for all active scenarios and returns the results.
 * @param {object} params - Simulation parameters
 * @param {string[]} scenarios - Array of scenario keys (e.g. ['bear','base','bull','custom'])
 * @param {object} options - { lifeEvents, bridgePhase, appliedCuts }
 * @returns {object} simData - Map of scenario key to simulation result array
 */
export function useSimulation(params, scenarios, { lifeEvents, bridgePhase, appliedCuts }) {
  return useMemo(() => {
    const opts = { lifeEvents, bridgePhase, cutOverrides: appliedCuts }
    return Object.fromEntries(scenarios.map(k => [k, runSimulation(params, k, opts)]))
  }, [params, lifeEvents, bridgePhase, appliedCuts, scenarios])
}
