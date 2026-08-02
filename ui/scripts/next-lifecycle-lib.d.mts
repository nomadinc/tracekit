export function assetPathsFromHtml(html: string): string[];
export function missingManifestAssets(distDirectory: string): string[];
export function nextProcessesForDirectory(directory: string): Array<{ pid: number; command: string }>;
