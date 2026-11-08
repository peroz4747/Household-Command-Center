export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ startNewsTopCollector }, { startNotifier }] = await Promise.all([import("./lib/newsTop"), import("./lib/notifier")]);
    startNewsTopCollector();
    startNotifier();
  }
}
