import { useCallback, useEffect, useRef, useState } from 'react';

// Carga un recurso y lo refresca por intervalo y al recuperar el foco.
// Los refetch de fondo son silenciosos (no vuelven a mostrar "cargando").
export function useApiResource(fetcher, { pollMs } = {}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus('loading');
    try {
      const result = await fetcherRef.current();
      setData(result);
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(err);
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const interval = setInterval(() => load({ silent: true }), pollMs);
    const onFocus = () => load({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [pollMs, load]);

  return { data, status, error, reload: load };
}
