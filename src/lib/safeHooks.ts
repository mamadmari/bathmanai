import { useRestQuery, useRestMutation } from "@/lib/restApi";

export function useQuery(reference: any, args?: any): any {
  return useRestQuery(reference, args);
}

export function useMutation(reference: any): any {
  return useRestMutation(reference);
}

export function useAction(reference: any): any {
  return useRestMutation(reference);
}
