import { trainingCertificateResult } from "./training-certificate";

describe(trainingCertificateResult.name, () => {
  it("выбирает лучшую попытку и учитывает все попытки", () => {
    expect(trainingCertificateResult([null, 68, 84], 75)).toEqual({
      attempts: 3,
      finalScore: 84,
    });
  });

  it("не выдаёт результат без пройденного порога", () => {
    expect(trainingCertificateResult([null, 74], 75)).toBeNull();
  });
});
