import { handle } from './handle';
import { writeExport } from '@main/export/Exporter';

/** export:write — serialise rows and save them through the OS dialog. */
export function registerExportIpc(): void {
  handle('export:write', (req) => writeExport(req));
}
