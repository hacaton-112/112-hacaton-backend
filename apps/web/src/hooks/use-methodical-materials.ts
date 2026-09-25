import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type {
  MethodicalMaterial,
  MethodicalMaterialInput,
} from "../contracts/methodical-materials";
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
  const create = useMutation({
    mutationFn: (input: MethodicalMaterialInput) =>
      methodicalMaterialsService.create(input),
    onSuccess: (created) => {
      queryClient.setQueryData<MethodicalMaterial[]>(queryKey, (current) => [
        ...(current ?? []),
        created,
      ]);
    },
  });
  const update = useMutation({
    mutationFn: (input: {
      materialId: string;
      material: MethodicalMaterialInput;
    }) => methodicalMaterialsService.update(input.materialId, input.material),
    onSuccess: (updated) => {
      queryClient.setQueryData<MethodicalMaterial[]>(queryKey, (current) =>
        current?.map((material) =>
          material.id === updated.id ? updated : material,
        ),
      );
    },
  });

  return { materials, completion, authoring: { create, update } };
}

export type MethodicalAuthoringMutations = ReturnType<
  typeof useMethodicalMaterials
>["authoring"];
