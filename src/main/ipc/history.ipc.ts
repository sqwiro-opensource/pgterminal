import { handle } from './handle';
import { QueryHistory } from '@main/history/QueryHistory';

const history = new QueryHistory();

export function registerHistoryIpc(): void {
  handle('history:list', (req) => history.list(req));
  handle('history:clear', (req) => {
    history.clear(req.connectionId);
  });
}
