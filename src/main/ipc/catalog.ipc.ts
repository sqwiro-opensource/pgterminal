import { handle } from './handle';
import { CatalogService } from '@main/catalog/CatalogService';
import type { PoolProvider } from '@main/catalog/Queryable';
import { registry } from '@main/db/ConnectionRegistry';
import { getSettings } from '@main/store/stores';

let service: CatalogService | null = null;

/** The process-wide catalog service, created on first use with the connection registry as pool provider. */
export async function getCatalogService(): Promise<CatalogService> {
  if (service) return service;
  const provider: PoolProvider = {
    getPool: (connectionId, database) => registry.getPool(connectionId, database)
  };
  service = new CatalogService(provider);
  return service;
}

async function showInternalSchemas(): Promise<boolean> {
  try {
    return getSettings().showInternalSchemas === true;
  } catch {
    return false;
  }
}

export function registerCatalogIpc(): void {
  handle('catalog:getNode', async (req) => {
    const svc = await getCatalogService();
    return svc.getNode({ ...req, showInternal: await showInternalSchemas() });
  });
  handle('catalog:completionIndex', async (req) => {
    const svc = await getCatalogService();
    return svc.getCompletionIndex({ ...req, showInternal: await showInternalSchemas() });
  });
  handle('catalog:invalidate', async (req) => {
    const svc = await getCatalogService();
    svc.invalidate(req.connectionId, req.database, req.nodeId);
  });
}
