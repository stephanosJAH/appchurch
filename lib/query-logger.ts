import { QueryClient } from "@tanstack/react-query";

// Logger de diagnóstico: registra inicio/fin de cada query de React Query con
// su duración y cantidad de filas. Solo en desarrollo (__DEV__), para no ensuciar
// producción. Devuelve la función de unsubscribe.
export function attachQueryLogger(qc: QueryClient) {
  const starts = new Map<string, number>();
  const cache = qc.getQueryCache();

  return cache.subscribe((event) => {
    if (event.type !== "updated") return;
    const query = event.query;
    const action = (event as any).action;
    if (!action?.type) return;

    const key = JSON.stringify(query.queryKey);

    if (action.type === "fetch") {
      starts.set(query.queryHash, Date.now());
      console.log(`[query] ▶ ${key}`);
      return;
    }

    if (action.type === "success") {
      const t0 = starts.get(query.queryHash);
      const ms = t0 ? Date.now() - t0 : -1;
      starts.delete(query.queryHash);
      const data = action.data;
      const filas = Array.isArray(data) ? data.length : data == null ? 0 : 1;
      console.log(`[query] ✔ ${key} — ${ms}ms — ${filas} fila(s)`);
      return;
    }

    if (action.type === "error") {
      const t0 = starts.get(query.queryHash);
      const ms = t0 ? Date.now() - t0 : -1;
      starts.delete(query.queryHash);
      console.warn(`[query] ✖ ${key} — ${ms}ms — ${action.error?.message ?? action.error}`);
    }
  });
}
