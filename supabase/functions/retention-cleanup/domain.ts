export function isCleanupKeyValid(
  configuredKey: string | undefined,
  providedKey: string | null,
): boolean {
  if (!configuredKey || !providedKey || configuredKey.length < 32) return false;
  if (configuredKey.length !== providedKey.length) return false;

  let difference = 0;
  for (let index = 0; index < configuredKey.length; index += 1) {
    difference |= configuredKey.charCodeAt(index) ^
      providedKey.charCodeAt(index);
  }
  return difference === 0;
}
