import { useEffect, useState } from 'react';
import type { FormationTop } from '../types';
import { fetchFormations } from '../api/corvaApi';
import { error } from '../utils/logger';

export interface UseFormationsResult {
  formations: FormationTop[];
  loading: boolean;
}

export function useFormations(assetId: number | undefined): UseFormationsResult {
  const [formations, setFormations] = useState<FormationTop[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetId) {
      setFormations([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const data = await fetchFormations(assetId);
        if (!cancelled) setFormations(data);
      } catch (e) {
        error('useFormations failed:', e);
        if (!cancelled) setFormations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return { formations, loading };
}
