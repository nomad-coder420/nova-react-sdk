import { useCallback, useContext, useEffect } from "react";
import { NovaContext } from "../context/NovaContext";

export const useNova = () => {
  const context = useContext(NovaContext);

  if (context === undefined) {
    throw new Error("useNova must be used within a NovaProvider");
  }

  return context;
};

export const useNovaObject = <T extends Record<string, any>>(
  objectName: string
) => {
  const { getNovaObject, isObjectLoaded, loadObject, state } = useNova();

  const props = getNovaObject<T>(objectName);
  const loaded = isObjectLoaded(objectName);
  const loading = state.isLoading;
  const error = state.error;

  const load = useCallback(
    async (forceReload: boolean = false) => {
      await loadObject(objectName, forceReload);
    },
    [loadObject, objectName]
  );

  return {
    props,
    loaded,
    loading,
    error,
    load,
  };
};

export const useNovaInit = () => {
  const { loadDefaults, loadAllObjects, state } = useNova();

  useEffect(() => {
    const initialize = async () => {
      // Load defaults first
      await loadDefaults();

      // Then try to load from backend
      await loadAllObjects();
    };

    initialize();
  }, [loadDefaults, loadAllObjects]);

  return {
    isReady: Object.keys(state.objects).length > 0,
    loading: state.isLoading,
    error: state.error,
  };
};
