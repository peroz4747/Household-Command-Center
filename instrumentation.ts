export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ startNewsTopCollector }, { startNotifier }, { startSpeedCollector }] = await Promise.all([
      import("./lib/newsTop"),
      import("./lib/notifier"),
      import("./lib/internetHistory"),
    ]);
    const { startSnapCams } = await import("./lib/snapCams");
    startSnapCams();
    startNewsTopCollector();
    startNotifier();
    startSpeedCollector();
  }
}
