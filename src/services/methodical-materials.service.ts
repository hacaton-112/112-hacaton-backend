import { API_CONFIG } from "../config/api";
import {
  MethodicalMaterialListSchema,
  MethodicalMaterialSchema,
  type MethodicalMaterial,
} from "../contracts/methodical-materials";
import { api } from "../lib/api";

export const methodicalMaterialsService = {
  async list(): Promise<MethodicalMaterial[]> {
    const payload = await api.get<unknown>(
      API_CONFIG.getMethodicalMaterialsUrl(),
    );
    return MethodicalMaterialListSchema.parse(payload).materials;
  },

  async setSectionCompletion(
    materialId: string,
    sectionId: string,
    completed: boolean,
  ): Promise<MethodicalMaterial> {
    const payload = await api.put<unknown>(
      API_CONFIG.getMethodicalSectionCompletionUrl(materialId, sectionId),
      { completed },
    );
    return MethodicalMaterialSchema.parse(payload);
  },
};
