interface Quittable {
  quit(): void;
  exit(code?: number): void;
}

/**
 * Returns a signal handler that routes SIGTERM/SIGINT through Electron's normal quit path.
 * The first signal quits; a second one exits immediately.
 */
export function createSignalHandler(app: Quittable, onQuit: () => void): () => void {
  let signalled = false;
  return () => {
    if (signalled) {
      app.exit(0);
      return;
    }
    signalled = true;
    onQuit();
    app.quit();
  };
}
