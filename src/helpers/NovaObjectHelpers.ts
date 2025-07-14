import { NovaObjectDefinition } from "../context/NovaContext";

// Helper function to create type-safe object definitions
export const defineNovaObject = <T extends Record<string, any>>(
  name: string,
  defaultProps: T
): NovaObjectDefinition<T> => {
  return {
    name,
    defaultProps,
  };
};

// Type guard to check if an object is properly defined
export const isValidNovaObject = (obj: any): obj is NovaObjectDefinition => {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.name === "string" &&
    obj.defaultProps &&
    typeof obj.defaultProps === "object"
  );
};
