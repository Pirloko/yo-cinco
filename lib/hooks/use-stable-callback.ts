import { useCallback, useRef } from 'react'

/**
 * Devuelve una función con identidad estable que siempre delega en la última implementación.
 * Útil para valores en Context que no deben invalidar useMemo de consumidores cuando cambia solo el cierre léxico.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: A) => ref.current(...args), [])
}
