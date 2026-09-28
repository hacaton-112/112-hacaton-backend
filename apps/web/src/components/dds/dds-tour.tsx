import { GuidedTour } from "../guided-tour";
import { ddsTourSteps, type DdsTourView } from "./dds-tour-steps";

export function DdsTour({ view }: { view: DdsTourView }) {
  return (
    <GuidedTour
      ariaLabel="Ознакомиться с рабочим местом ДДС"
      dataTour="dds-tour-button"
      steps={ddsTourSteps(view)}
    />
  );
}
