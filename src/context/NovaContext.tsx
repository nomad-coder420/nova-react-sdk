import React, { createContext, useReducer, ReactNode } from "react";

export interface NovaConfig {
  organisationId: string;
  appId: string;
  apiEndpoint: string;
}

export interface NovaUser {
  userId: string;
  userProfile: Record<string, any> | null;
}

export interface NovaObjectDefinition<T = Record<string, any>> {
  name: string;
  defaultProps: T;
}

export interface NovaObject<T = Record<string, any>> {
  name: string;
  defaultProps: T;
  props: T | null; // Props from backend variant or null if not loaded
  isLoaded: boolean;
  lastFetched?: Date;
}

export interface NovaObjects {
  [name: string]: NovaObject;
}

export interface NovaState {
  config: NovaConfig;
  user: NovaUser | null;
  objects: NovaObjects;

  isLoading: boolean;
  error: string | null;
}

type NovaAction =
  | { type: "SET_CONFIG"; payload: Partial<NovaConfig> }
  | { type: "SET_USER"; payload: NovaUser }
  | { type: "SET_DEFAULTS"; payload: { [name: string]: Record<string, any> } }
  | { type: "UPDATE_OBJECT_PROPS"; payload: { name: string; props: any } }
  | {
      type: "SET_BULK_OBJECTS";
      payload: { [name: string]: Record<string, any> };
    }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null };

interface FeatureVariantResponse {
  feature_id: string;
  feature_name: string;
  variant_id: string | null;
  variant_name: string;
  variant_config: Record<string, any>;
  experience_id: string | null;
  experience_name: string | null;
  personalisation_id: string | null;
  personalisation_name: string | null;
  segment_id: string | null;
  segment_name: string | null;
  evaluation_reason: string;
}

interface GetFeatureVariantsResponse {
  [feature_name: string]: FeatureVariantResponse;
}

// Create context
export interface NovaContextValue {
  state: NovaState;
  dispatch: React.Dispatch<NovaAction>;

  // Configuration methods
  updateConfig: (config: Partial<NovaConfig>) => void;
  setUser: (user: NovaUser) => void;

  // Object management methods
  loadDefaults: () => Promise<void>;
  getNovaObject: <T extends Record<string, any>>(
    objectName: string
  ) => T | null;
  isObjectLoaded: (objectName: string) => boolean;

  // API methods
  loadObject: (objectName: string, forceReload?: boolean) => Promise<void>;
  loadAllObjects: (forceReload?: boolean) => Promise<void>;
  loadObjects: (objectNames: string[], forceReload?: boolean) => Promise<void>;

  // Utility methods
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const NovaContext = createContext<NovaContextValue | undefined>(
  undefined
);

const novaReducer = (state: NovaState, action: NovaAction): NovaState => {
  switch (action.type) {
    case "SET_CONFIG":
      return {
        ...state,
        config: { ...state.config, ...action.payload },
      };

    case "SET_USER":
      return {
        ...state,
        user: action.payload,
      };

    case "SET_DEFAULTS":
      const newObjects: NovaObjects = {};

      Object.entries(action.payload).forEach(([objectName, objectProps]) => {
        if (newObjects[objectName]) {
          newObjects[objectName] = {
            ...newObjects[objectName],
            name: objectName,
            defaultProps: objectProps,
          };
        }
      });

      return {
        ...state,
        objects: newObjects,
      };

    case "UPDATE_OBJECT_PROPS":
      const { name, props } = action.payload;
      return {
        ...state,
        objects: {
          ...state.objects,
          [name]: {
            ...state.objects[name],
            props,
            isLoaded: true,
            lastFetched: new Date(),
          },
        },
      };

    case "SET_BULK_OBJECTS":
      const updatedObjects = { ...state.objects };

      Object.entries(action.payload).forEach(([objectName, objectProps]) => {
        updatedObjects[objectName] = {
          ...updatedObjects[objectName],
          props: objectProps,
          isLoaded: true,
          lastFetched: new Date(),
        };
      });

      return {
        ...state,
        objects: updatedObjects,
      };

    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.payload,
      };

    default:
      return state;
  }
};

interface NovaProviderProps {
  children: ReactNode;
  config: NovaConfig;
}

export const NovaProvider: React.FC<NovaProviderProps> = ({
  children,
  config,
}) => {
  const initialState: NovaState = {
    config,
    user: null,
    objects: {},
    isLoading: false,
    error: null,
  };

  const [state, dispatch] = useReducer(novaReducer, initialState);

  // Configuration methods
  const updateConfig = (newConfig: Partial<NovaConfig>) => {
    dispatch({ type: "SET_CONFIG", payload: newConfig });
  };

  const setUser = (user: NovaUser) => {
    dispatch({ type: "SET_USER", payload: user });
  };

  // Load defaults from nova-objects.json
  const loadDefaults = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await fetch("/nova-objects.json");

      if (!response.ok) {
        throw new Error("Failed to load nova-objects.json");
      }

      const data = await response.json();

      dispatch({ type: "SET_DEFAULTS", payload: data.features || {} });
    } catch (error) {
      console.error("Failed to load defaults:", error);
      setError(
        `Failed to load defaults: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Object management methods
  const getNovaObject = <T extends Record<string, any>>(
    objectName: string
  ): T | null => {
    const novaObject = state.objects[objectName];
    if (!novaObject) {
      console.error(`Object "${objectName}" not found. Did you register it?`);
      // throw new Error(`Object "${objectName}" not found`);
      return null;
    }

    // Return props from backend if loaded, otherwise return default props
    return (novaObject.props || novaObject.defaultProps) as T;
  };

  const isObjectLoaded = (objectName: string): boolean => {
    return state.objects[objectName]?.isLoaded || false;
  };

  // API methods
  const loadObject = async (
    objectName: string,
    forceReload: boolean = false
  ): Promise<void> => {
    if (!state.user) {
      throw new Error("User must be set before loading objects");
    }

    // Skip if already loaded (unless forcing reload)
    if (!forceReload && isObjectLoaded(objectName)) {
      console.log(`Object "${objectName}" already loaded, skipping...`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Replace with your actual API call
      const response = await fetch(
        `${state.config.apiEndpoint}/api/v1/user-experience/get-variant/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: state.config.organisationId,
            app_id: state.config.appId,
            user_id: state.user.userId,
            payload: state.user.userProfile || {},
            feature_name: objectName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load object: ${response.statusText}`);
      }

      const data = await response.json();

      const variantConfig = (data as FeatureVariantResponse)?.variant_config;

      dispatch({
        type: "UPDATE_OBJECT_PROPS",
        payload: { name: objectName, props: variantConfig },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to load object "${objectName}": ${errorMessage}`);

      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loadObjects = async (
    objectNames: string[],
    forceReload: boolean = false
  ): Promise<void> => {
    if (!state.user) {
      throw new Error("User must be set before loading objects");
    }

    // Filter out already loaded objects (unless forcing reload)
    const objectsToLoad = forceReload
      ? objectNames
      : objectNames.filter((name) => !isObjectLoaded(name));

    if (objectsToLoad.length === 0) {
      console.log("All requested objects already loaded, skipping...");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Replace with your actual bulk API call
      const response = await fetch(
        `${state.config.apiEndpoint}/api/v1/user-experience/get-variants-batch/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: state.config.organisationId,
            app_id: state.config.appId,
            user_id: state.user.userId,
            payload: state.user.userProfile || {},
            feature_names: objectsToLoad,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load objects: ${response.statusText}`);
      }

      const data = await response.json();

      const objects: { [name: string]: Record<string, any> } = {};

      Object.entries(data as GetFeatureVariantsResponse).forEach(
        ([featureName, featureData]: [string, FeatureVariantResponse]) => {
          if (featureName) {
            objects[featureName] = featureData?.variant_config || {};
          }
        }
      );

      dispatch({
        type: "SET_BULK_OBJECTS",
        payload: objects,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to load objects: ${errorMessage}`);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loadAllObjects = async (
    forceReload: boolean = false
  ): Promise<void> => {
    // Skip if already loaded and not forcing reload
    if (!forceReload && Object.keys(state.objects).length > 0) {
      console.log("Objects already loaded, skipping...");
      return;
    }

    if (!state.user) {
      throw new Error("User must be set before loading objects");
    }

    setLoading(true);
    setError(null);

    try {
      // Replace with your actual bulk API call
      const response = await fetch(
        `${state.config.apiEndpoint}/api/v1/user-experience/get-all-variants/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: state.config.organisationId,
            app_id: state.config.appId,
            user_id: state.user.userId,
            payload: state.user.userProfile || {},
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load objects: ${response.statusText}`);
      }

      const data = await response.json();

      const objects: { [name: string]: Record<string, any> } = {};

      Object.entries(data as GetFeatureVariantsResponse).forEach(
        ([featureName, featureData]: [string, FeatureVariantResponse]) => {
          if (featureName) {
            objects[featureName] = featureData?.variant_config || {};
          }
        }
      );

      dispatch({
        type: "SET_BULK_OBJECTS",
        payload: objects,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to load objects: ${errorMessage}`);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Utility methods
  const setLoading = (loading: boolean) => {
    dispatch({ type: "SET_LOADING", payload: loading });
  };

  const setError = (error: string | null) => {
    dispatch({ type: "SET_ERROR", payload: error });
  };

  const value: NovaContextValue = {
    state,
    dispatch,

    updateConfig,
    setUser,

    loadDefaults,
    getNovaObject,
    isObjectLoaded,

    loadObject,
    loadAllObjects,
    loadObjects,

    setLoading,
    setError,
  };

  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
};
