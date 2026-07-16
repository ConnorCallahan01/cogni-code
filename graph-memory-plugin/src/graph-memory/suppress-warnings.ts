const originalEmit = process.emit.bind(process) as (name: string | symbol, ...args: any[]) => boolean;
process.emit = ((name: string | symbol, ...args: any[]): boolean => {
  if (name === "warning") {
    const w = args[0];
    if (w?.name === "ExperimentalWarning" || w?.code === "ExperimentalWarning") {
      return false;
    }
  }
  return originalEmit(name, ...args);
}) as typeof process.emit;
