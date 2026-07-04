type BackgroundJobInput = {
  key: string;
  label: string;
  run: () => Promise<void>;
};

const runningJobKeys = new Set<string>();

export function enqueueAdminBackgroundJob(input: BackgroundJobInput) {
  if (runningJobKeys.has(input.key)) {
    return false;
  }

  runningJobKeys.add(input.key);
  setTimeout(() => {
    input
      .run()
      .catch((error) => {
        console.error(`${input.label} failed:`, error);
      })
      .finally(() => {
        runningJobKeys.delete(input.key);
      });
  }, 0);

  return true;
}
