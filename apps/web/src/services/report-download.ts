import type {
  InstructorReportFilters,
  ReportFormat,
} from "../contracts/reports";

export const reportRequestParams = (
  filters: InstructorReportFilters,
  format?: ReportFormat,
) => ({
  scope: filters.scope,
  ...(filters.scope === "group"
    ? { groupId: filters.groupId }
    : { operatorId: filters.operatorId }),
  ...(filters.from ? { from: filters.from } : {}),
  ...(filters.to ? { to: filters.to } : {}),
  ...(format ? { format } : {}),
});

const safeFilename = (value: string): string =>
  [...value.replaceAll("\\", "_").replaceAll("/", "_")]
    .map((character) =>
      character.charCodeAt(0) < 32 || /[<>:"|?*]/.test(character)
        ? "_"
        : character,
    )
    .join("")
    .trim();

/** RFC 5987 и обычный filename из Content-Disposition. */
export const filenameFromContentDisposition = (
  header: string | null,
): string | null => {
  if (!header) return null;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = header.match(/filename="([^"]+)"/i)?.[1];
  const candidate = encoded ? decodeURIComponent(encoded) : plain;
  if (!candidate) return null;
  const filename = safeFilename(candidate);
  return filename.length > 0 ? filename : null;
};

export const saveReportBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
