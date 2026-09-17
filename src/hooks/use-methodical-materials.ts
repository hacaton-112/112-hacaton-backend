import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type { MethodicalMaterial } from "../contracts/methodical-materials";
import { methodicalMaterialsService } from "../services/methodical-materials.service";

export function useMethodicalMaterials() {
  const queryClient = useQueryClient();
  const queryKey = QUERY_KEYS.methodicalMaterials();
  const materials = useQuery({
    queryKey,
    queryFn: methodicalMaterialsService.list,
  });
  const completion = useMutation({
    mutationFn: (input: {
      materialId: string;
      sectionId: string;
      completed: boolean;
    }) =>
      methodicalMaterialsService.setSectionCompletion(
        input.materialId,
        input.sectionId,
        input.completed,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData<MethodicalMaterial[]>(queryKey, (current) =>
        current?.map((material) =>
          material.id === updated.id ? updated : material,
        ),
      );
    },
  });

  return { materials, completion };
}
