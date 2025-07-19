export const callApi = async <T>(
  url: string,
  options: any = {}
): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} - ${response.statusText}`);
  }

  return response.json() as T;
};
