import React, {
  createContext,
  useReducer,
  ReactNode,
  useCallback,
} from "react";
import { callApi } from "../service/api";

export interface NovaConfig {
  organisationId: string;
  appId: string;
  apiEndpoint: string;
}

export type UserProfile = Record<string, any>;

export interface NovaUser {
  userId: string;
  userProfile: UserProfile;

  novaUserId: string;
}

export interface SetNovaUser {
  userId: string;
  userProfile: UserProfile;
}

export type NovaObjectConfig = Record<string, any>;

export interface NovaObject {
  config: NovaObjectConfig;
  variantName: string | null;
}

export interface NovaExperience {
  personalisationName: string | null;
  objects: {
    [objectName: string]: NovaObject;
  };
  evaluationReason: string | null;
  isLoaded: boolean;
  lastFetched?: Date;
}

export interface NovaExperiences {
  [experienceName: string]: NovaExperience;
}

export interface NovaState {
  config: NovaConfig;
  user: NovaUser | null;

  isLoading: boolean;
  error: string | null;

  experiences: NovaExperiences;
}

export interface NovaExperienceResponse {
  experience_id: string;
  personalisation_id: string | null;
  personalisation_name: string | null;
  features: {
    [featureName: string]: {
      feature_id: string;
      feature_name: string;
      variant_id: string | null;
      variant_name: string | null;
      config: NovaObjectConfig;
    };
  };
  evaluation_reason: string;
}

export interface GetExperiencesResponse {
  [experienceName: string]: NovaExperienceResponse;
}

type NovaAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_CONFIG"; payload: Partial<NovaConfig> }
  | { type: "SET_USER"; payload: SetNovaUser }
  | { type: "UPDATE_USER_PROFILE"; payload: UserProfile }
  | {
      type: "SET_EXPERIENCE";
      payload: { experienceName: string; experience: NovaExperience };
    }
  | {
      type: "SET_EXPERIENCES";
      payload: { [experienceName: string]: NovaExperience };
    };

// Create context
export interface NovaContextValue {
  state: NovaState;
  dispatch: React.Dispatch<NovaAction>;

  // Utility methods
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Configuration methods
  updateConfig: (config: Partial<NovaConfig>) => void;
  setUser: (user: SetNovaUser) => Promise<void>;
  updateUserProfile: (userProfile: UserProfile) => Promise<void>;

  // Experience Load methods
  loadExperience: (experienceName: string) => Promise<void>;
  loadExperiences: (experienceNames: string[] | null) => Promise<void>;
  loadAllExperiences: () => Promise<void>;

  // Experience get methods
  isExperienceLoaded: (experienceName: string) => boolean;
  readExperience: <T extends Record<string, any>>(
    experienceName: string
  ) => T | null;
  getExperience: <T extends Record<string, any>>(
    experienceName: string
  ) => Promise<T | null>;

  // Analytics methods
  trackEvent: (
    eventName: string,
    eventData?: Record<string, any>
  ) => Promise<void>;
}

export const NovaContext = createContext<NovaContextValue | undefined>(
  undefined
);

const novaReducer = (state: NovaState, action: NovaAction): NovaState => {
  switch (action.type) {
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

    case "UPDATE_USER_PROFILE":
      if (!state.user) {
        return state;
      }

      return {
        ...state,
        user: {
          ...state.user,
          userProfile: { ...state.user.userProfile, ...action.payload },
        },
      };

    case "SET_EXPERIENCE":
      return {
        ...state,
        experiences: {
          ...state.experiences,
          [action.payload.experienceName]: action.payload.experience,
        },
      };

    case "SET_EXPERIENCES":
      return {
        ...state,
        experiences: { ...state.experiences, ...action.payload },
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
    isLoading: false,
    error: null,
    experiences: {},
  };

  const [state, dispatch] = useReducer(novaReducer, initialState);

  // Utility methods
  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_LOADING", payload: loading });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", payload: error });
  }, []);

  // Configuration methods
  const updateConfig = useCallback((newConfig: Partial<NovaConfig>) => {
    dispatch({ type: "SET_CONFIG", payload: newConfig });
  }, []);

  const setUser = useCallback(
    async (user: SetNovaUser) => {
      const userResponse = await callApi<{ nova_user_id: string }>(
        `${state.config.apiEndpoint}/api/v1/users/create-user/`,
        {
          method: "POST",
          body: JSON.stringify({
            organisation_id: state.config.organisationId,
            app_id: state.config.appId,
            user_id: user.userId,
            user_profile: user.userProfile,
          }),
        }
      );

      if (!userResponse.nova_user_id) {
        throw new Error("Nova user id not found");
      }

      const payload = {
        userId: user.userId,
        userProfile: user.userProfile,
        novaUserId: userResponse.nova_user_id,
      };

      dispatch({ type: "SET_USER", payload: payload });
    },
    [state.config]
  );

  const updateUserProfile = useCallback(
    async (userProfile: UserProfile) => {
      if (!state.user) return;

      dispatch({ type: "UPDATE_USER_PROFILE", payload: userProfile });

      await callApi<{ nova_user_id: string }>(
        `${state.config.apiEndpoint}/api/v1/users/update-user-profile/`,
        {
          method: "POST",
          body: JSON.stringify({
            organisation_id: state.config.organisationId,
            app_id: state.config.appId,
            user_id: state.user.novaUserId,
            user_profile: userProfile,
          }),
        }
      );
    },
    [state.config, state.user]
  );

  // Experiences Load Methods
  const loadExperience = useCallback(
    async (experienceName: string) => {
      if (!state.user) {
        throw new Error("User must be set before loading experiences");
      }

      setLoading(true);
      setError(null);

      try {
        const data = await callApi<NovaExperienceResponse>(
          `${state.config.apiEndpoint}/api/v1/user-experience/get-experience/`,
          {
            method: "POST",
            body: JSON.stringify({
              organisation_id: state.config.organisationId,
              app_id: state.config.appId,
              user_id: state.user.novaUserId,
              experience_name: experienceName,
            }),
          }
        );

        const experienceObjects: { [objectName: string]: NovaObject } = {};

        for (const [featureName, featureData] of Object.entries(
          data.features
        )) {
          experienceObjects[featureName] = {
            variantName: featureData.variant_name,
            config: featureData.config,
          };
        }

        const novaExperience: NovaExperience = {
          personalisationName: data?.personalisation_name,
          evaluationReason: data?.evaluation_reason,
          isLoaded: true,
          lastFetched: new Date(),
          objects: experienceObjects,
        };

        dispatch({
          type: "SET_EXPERIENCE",
          payload: {
            experienceName,
            experience: novaExperience,
          },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setError(
          `Failed to load experience "${experienceName}": ${errorMessage}`
        );

        throw error;
      } finally {
        setLoading(false);
      }
    },
    [state.config, state.user, setLoading, setError]
  );

  const loadExperiences = useCallback(
    async (experienceNames: string[] | null = null) => {
      if (!state.user) {
        throw new Error("User must be set before loading experiences");
      }

      setLoading(true);
      setError(null);

      try {
        const data = await callApi<GetExperiencesResponse>(
          `${state.config.apiEndpoint}/api/v1/user-experience/get-experiences/`,
          {
            method: "POST",
            body: JSON.stringify({
              organisation_id: state.config.organisationId,
              app_id: state.config.appId,
              user_id: state.user.novaUserId,
              experience_names: experienceNames,
            }),
          }
        );

        // Map GetExperiencesResponse to NovaExperiences
        const novaExperiences: NovaExperiences = {};

        for (const [experienceName, experienceData] of Object.entries(data)) {
          const experienceObjects: { [objectName: string]: NovaObject } = {};

          for (const [featureName, featureData] of Object.entries(
            experienceData.features
          )) {
            experienceObjects[featureName] = {
              variantName: featureData.variant_name,
              config: featureData.config,
            };
          }

          const novaExperience: NovaExperience = {
            personalisationName: experienceData.personalisation_name,
            evaluationReason: experienceData.evaluation_reason,
            isLoaded: true,
            lastFetched: new Date(),
            objects: experienceObjects,
          };

          novaExperiences[experienceName] = novaExperience;
        }

        dispatch({
          type: "SET_EXPERIENCES",
          payload: novaExperiences,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setError(
          `Failed to load experiences "${
            experienceNames ? experienceNames.join(", ") : "all"
          }": ${errorMessage}`
        );

        throw error;
      } finally {
        setLoading(false);
      }
    },
    [state.config, state.user, setLoading, setError]
  );

  const loadAllExperiences = useCallback(async () => {
    loadExperiences(null);
  }, [loadExperiences]);

  // Experience get methods
  const isExperienceLoaded = useCallback(
    (experienceName: string) => {
      return state.experiences[experienceName]?.isLoaded || false;
    },
    [state.experiences]
  );

  const readExperience = useCallback(
    <T extends Record<string, any>>(experienceName: string) => {
      const experience = state.experiences[experienceName];

      if (!experience) {
        return null;
      }

      const experienceFeatures: { [objectName: string]: NovaObjectConfig } = {};

      for (const [objectName, object] of Object.entries(experience.objects)) {
        experienceFeatures[objectName] = object.config;
      }

      return experienceFeatures as T;
    },
    [state.experiences]
  );

  const getExperience = useCallback(
    async <T extends Record<string, any>>(experienceName: string) => {
      if (!isExperienceLoaded(experienceName)) {
        await loadExperience(experienceName);
      }

      return readExperience<T>(experienceName);
    },
    [state.experiences]
  );

  // Analytics methods
  const trackEvent = useCallback(
    async (eventName: string, eventData?: Record<string, any>) => {
      if (
        !state.config.organisationId ||
        !state.config.appId ||
        !state.user?.novaUserId
      )
        return;

      await callApi<{ event_id: string }>(
        `${state.config.apiEndpoint}/api/v1/metrics/track-event/`,
        {
          method: "POST",
          body: JSON.stringify({
            organisation_id: state.config.organisationId,
            app_id: state.config.appId,
            user_id: state.user.novaUserId,
            event_name: eventName,
            event_data: eventData || {},
            timestamp: new Date().toISOString(),
          }),
        }
      );
    },
    [state.config, state.user?.novaUserId]
  );

  const value: NovaContextValue = {
    state,
    dispatch,

    setLoading,
    setError,

    updateConfig,
    setUser,
    updateUserProfile,

    loadExperience,
    loadExperiences,
    loadAllExperiences,

    isExperienceLoaded,
    readExperience,
    getExperience,

    trackEvent,
  };

  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
};
