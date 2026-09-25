import {
  parseWorkstationConfiguration,
  serializeWorkstationConfiguration,
  type WorkstationConfigurationRow,
} from "@/modules/telephony/domain/workstation-configuration";

const row: WorkstationConfigurationRow = {
  name: "АРМ пожарной охраны",
  service: "dds_01",
  assignedUser: "operator@example.test",
  extension: "201",
  active: true,
};

describe("workstation configuration", () => {
  it.each(["xml", "csv"] as const)("round-trips valid %s", (format) => {
    const artifact = serializeWorkstationConfiguration([row], format);
    expect(format === "xml" ? artifact.startsWith('<?xml version="1.0" encoding="UTF-8"?>') : artifact.startsWith("\uFEFF")).toBe(true);
    expect(parseWorkstationConfiguration(artifact, format)).toEqual({ rows: [row], issues: [] });
  });

  it("rejects an unknown service", () => {
    const csv = "name;service;assignedUser;extension;active\nАРМ;unknown;;201;true\n";
    expect(parseWorkstationConfiguration(csv, "csv").issues[0]?.reason).toContain("Неизвестная служба");
  });

  it("rejects a duplicate extension", () => {
    const csv = "name;service;assignedUser;extension;active\nАРМ 1;dds_01;;201;true\nАРМ 2;dds_02;;201;true\n";
    expect(parseWorkstationConfiguration(csv, "csv").issues).toEqual([
      { row: 3, extension: "201", reason: "Внутренний номер 201 повторяется в файле" },
    ]);
  });
});
