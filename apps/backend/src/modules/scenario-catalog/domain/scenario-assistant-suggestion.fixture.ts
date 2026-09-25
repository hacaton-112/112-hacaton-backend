export const validAssistantSuggestion = () => ({
  title: "Учебный пожар в мастерской",
  category: "fire" as const,
  difficulty: 3,
  situation:
    "В учебной мастерской сильное задымление, один человек надышался дымом, он в сознании.",
  caller: {
    name: "Елена Учебная",
    gender: "female" as const,
    age: 42,
  },
  victims: 1 as number | null,
  services: ["fire", "ambulance"] as const,
  details: ["Заявитель стоит во дворе мастерской", "Огня не видно, только дым"],
  openingLine: "Алло, у нас дым в мастерской!",
});
