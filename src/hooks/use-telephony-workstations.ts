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

  return { workstations, seat, free };
}
