import { useParams } from "react-router";

import { DebriefCallList } from "../../components/debrief/debrief-call-list";
import { DebriefDetails } from "../../components/debrief/debrief-details";
import { useDebrief } from "../../hooks/use-debrief";

export default function DebriefPage() {
  const { trainingSessionId } = useParams();
  const state = useDebrief(trainingSessionId);

  return trainingSessionId ? (
    <DebriefDetails
      debrief={state.debrief}
      isPending={state.isPending}
      error={state.error}
      loadRecordingSegment={state.loadRecordingSegment}
    />
  ) : (
    <DebriefCallList
      calls={state.calls}
      isPending={state.isPending}
      error={state.error}
    />
  );
}
