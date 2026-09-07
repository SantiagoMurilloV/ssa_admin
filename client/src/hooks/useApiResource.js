import { useCallback, useEffect, useRef, useState } from 'react';

// Carga un recurso y lo refresca por intervalo y al recuperar el foco.
// Los refetch de fondo son silenciosos (no vuelven a mostrar "cargando").
//
// `key` identifica QUÉ se está pidiendo (el filtro activo, por ejemplo): cuando
// cambia, se vuelve a cargar. Sin esto, cambiar de pestaña en Pedidos dejaba en
// pantalla la lista anterior hasta el siguiente poll, y parecía que los pedidos
// confirmados o cancelados habían desaparecido.
export function useApiResource(fetcher, { pollMs, key } = {}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // Cada carga lleva un número; una respuesta que llega después de que otra
  // carga arrancó se descarta, para que un poll lento no pise el filtro nuevo.
  const requestRef = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestRef.current;
    if (!silent) setStatus('loading');
    try {
      const result = await fetcherRef.current();
      if (requestId !== requestRef.current) return;
      setData(result);
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (!silent) {
        setError(err);
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, key]);

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
