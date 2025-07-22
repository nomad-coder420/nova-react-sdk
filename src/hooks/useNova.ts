import { useCallback, useContext, useEffect } from "react";
import { NovaContext } from "../context/NovaContext";

export const useNova = () => {
  const context = useContext(NovaContext);

  if (context === undefined) {
    throw new Error("useNova must be used within a NovaProvider");
  }

  return context;
};

export const useNovaExperience = <T extends Record<string, any>>(
  experienceName: string
) => {
  const {
    loadExperience,
    isExperienceLoaded,
    readExperience,
    getExperience,
    state,
  } = useNova();

  const objects = readExperience<T>(experienceName);
  const loaded = isExperienceLoaded(experienceName);
  const loading = state.isLoading;
  const error = state.error;

  const load = useCallback(async () => {
    await loadExperience(experienceName);
  }, [loadExperience, experienceName]);

  const get = useCallback(async () => {
    await getExperience(experienceName);
  }, [getExperience, experienceName]);

  return {
    objects,
    loaded,
    loading,
    error,
    load,
    get,
  };
};

export const useNovaInit = () => {
  const { loadAllExperiences, state } = useNova();

  useEffect(() => {
    const initialize = async () => {
      // Then try to load from backend
      await loadAllExperiences();
    };

    initialize();
  }, [loadAllExperiences]);

  return {
    isReady: Object.keys(state.experiences).length > 0,
    loading: state.isLoading,
    error: state.error,
  };
};
