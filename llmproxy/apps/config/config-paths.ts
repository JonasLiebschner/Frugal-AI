export function getManagedConfigPath(packageName: string): string {
  return `DATA_DIR/config/${packageName}/config.json`;
}

export function getDefaultManagedConfigPath(packageName: string): string {
  return `.data/config/${packageName}/config.json`;
}
