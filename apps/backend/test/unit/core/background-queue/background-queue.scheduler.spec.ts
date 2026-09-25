import { BackgroundQueueScheduler } from "@/core/background-queue/background-queue.scheduler";

describe(BackgroundQueueScheduler.name, () => {
  it("runs all enabled queues and skips disabled ones", async () => {
    const scheduler = new BackgroundQueueScheduler({
      get: jest.fn().mockReturnValue(2_000),
    } as never);
    const enabled = jest.fn().mockResolvedValue(undefined);
    const disabled = jest.fn().mockResolvedValue(undefined);
    scheduler.register({ name: "enabled", enabled: () => true, run: enabled });
    scheduler.register({
      name: "disabled",
      enabled: () => false,
      run: disabled,
    });
    await scheduler.runOnce();
    expect(enabled).toHaveBeenCalled();
    expect(disabled).not.toHaveBeenCalled();
  });
});
