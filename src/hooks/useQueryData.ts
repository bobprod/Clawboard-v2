import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

/** Generic GET hook with React Query caching */
export function useApiQuery<T>(key: string[], path: string, options?: { enabled?: boolean }) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await apiFetchJson<T>(`${BASE}${path}`);
      if (error) throw new Error(error);
      return data as T;
    },
    ...options,
  });
}

/** Generic mutation hook with auto-invalidation */
export function useApiMutation(options: {
  mutationFn: () => Promise<unknown>;
  invalidateKeys?: string[][];
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: () => {
      options.invalidateKeys?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/** Pre-built hooks for common endpoints */
export function useTasks(options?: { enabled?: boolean }) {
  return useApiQuery<any[]>(["tasks"], "/api/tasks", options);
}

export function useArchives(options?: { enabled?: boolean }) {
  return useApiQuery<any[]>(["archives"], "/api/archives", options);
}

export function useRecurrences(options?: { enabled?: boolean }) {
  return useApiQuery<any[]>(["recurrences"], "/api/recurrences", options);
}

export function useModeles(options?: { enabled?: boolean }) {
  return useApiQuery<any[]>(["modeles"], "/api/modeles", options);
}

export function useSkills(options?: { enabled?: boolean }) {
  return useApiQuery<any[]>(["skills"], "/api/skills", options);
}

export function useMemory(options?: { enabled?: boolean }) {
  return useApiQuery<any[]>(["memory"], "/api/memory", options);
}

export function useHealth(options?: { enabled?: boolean }) {
  return useApiQuery<any>(["health"], "/api/health", options);
}

export function useTools(options?: { enabled?: boolean }) {
  return useApiQuery<any>(["tools"], "/api/tools", options);
}

export function useTask(id: string, options?: { enabled?: boolean }) {
  return useApiQuery<any>(["task", id], `/api/tasks/${id}`, options);
}
