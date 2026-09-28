import { useState, useEffect, useCallback } from "react";

export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.resolve()
      .then(() => fetcher())
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: execute };
}

export function errorMessage(err, serviceName = "Service") {
  if (!err) return `${serviceName} unavailable.`;
  if (typeof err === "string") return err;
  if (err.response?.data?.detail) {
    return typeof err.response.data.detail === "string"
      ? err.response.data.detail
      : JSON.stringify(err.response.data.detail);
  }
  if (err.response?.data?.error) return err.response.data.error;
  if (err.message) return `${serviceName} error: ${err.message}`;
  return `${serviceName} is currently unreachable.`;
}
