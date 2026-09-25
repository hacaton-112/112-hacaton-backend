import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { telephonyService } from "../services/telephony.service";

const queryKey = ["telephony-workstations"] as const;

/** Кто за каким телефоном: от этого зависит, к чьей карточке звонок наряду. */
export function useTelephonyWorkstations() {
  const queryClient = useQueryClient();
  const workstations = useQuery({
    queryKey,
    queryFn: telephonyService.listWorkstations,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const seat = useMutation({
    mutationFn: (input: { extension: string; userId: string }) =>
      telephonyService.seat(input.extension, input.userId),
    onSuccess: refresh,
  });
  const free = useMutation({
    mutationFn: (extension: string) => telephonyService.free(extension),
    onSuccess: refresh,
  });
  const exportConfiguration = useMutation({
    mutationFn: (format: "xml" | "csv") =>
      telephonyService.exportWorkstations(format),
  });
  const importConfiguration = useMutation({
    mutationFn: (input: {
      format: "xml" | "csv";
      content: string;
      dryRun: boolean;
    }) =>
      telephonyService.importWorkstations(
        input.format,
        input.content,
        input.dryRun,
      ),
    onSuccess: refresh,
  });

  return {
    workstations,
    seat,
    free,
    exportConfiguration,
    importConfiguration,
  };
}
