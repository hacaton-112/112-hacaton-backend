import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { callStates } from "@/drizzle/schema";

import type {
  TrainingCallAccess,
  TrainingCallOwnership,
} from "../ports/training-call-access.port";

/** Звонок закончился — точку в нём больше не отмечают. */
const FINISHED_STAGES = new Set(["ended", "declined"]);

@Injectable()
export class DrizzleTrainingCallAccess implements TrainingCallAccess {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async findCall(
    trainingSessionId: string,
  ): Promise<TrainingCallOwnership | null> {
    const [row] = await this.db
      .select({ operatorId: callStates.operatorId, stage: callStates.stage })
      .from(callStates)
      .where(eq(callStates.trainingSessionId, trainingSessionId))
      .limit(1);

    return row
      ? { operatorId: row.operatorId, isOver: FINISHED_STAGES.has(row.stage) }
      : null;
  }
}
