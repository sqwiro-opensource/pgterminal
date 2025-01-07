// src/renderer/src/components/ConnectionForm.tsx
import React, { useState } from 'react';

import { Block } from '@cloudhub-ux/mui';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import { MdiPlus } from '@cloudhub-ux-icons/mdi';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import EditDocument from '../../../document/EditDocument';

export const AddTableDialogButton: React.FC<{
  schema?: string;
  anchorComponent?: React.ReactNode;
  editingRow?: any;
  tableName?: string;
  tableStructure?: {
    [key: string]: {
      name: string;
      type: string;
      defaultValue: string;
      isNullable: boolean;
      isPrimaryKey: boolean;
    };
  };
}> = ({ schema, anchorComponent, editingRow = {}, tableName, tableStructure }) => {
  const [loading, setLoading] = useState(false);
  const dlgRef = React.useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { selectedConnection, editing, dispatch, reload, dbQuery } = useSelectedDatabaseContext();

  React.useEffect(() => {
    if (editingRow) {
      setOpen(true);
    }
  }, [editingRow]);

  const createTable = async (
    values: {
      tableName: string;
      columns: {
        [key: string]: {
          name: string;
          type: string;
          defaultValue: string;
          nullable: boolean;
          primary: boolean;
        };
      };
    },
    form
  ) => {
    setLoading(true);
    setError(null);

    try {
      const columnsSql = () => {
        const columns = Object.values(values.columns || {}).map((column) => {
          return `"${column.name}" ${column.type} ${column.nullable ? 'NULL' : 'NOT NULL'} ${column.primary ? 'PRIMARY KEY' : ''}`;
        });

        return columns.join(',\n');
      };

      const tableSql = `CREATE TABLE ${schema}."${values.tableName}" (${columnsSql()})`;

      const { data, error } = await dbQuery(tableSql);

      if (error) {
        setError(error);
        return;
      }

      reload();

      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const title = 'Edit Column';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        style={{
          minWidth: '1000px',
          minHeight: '700px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Block flex={false} padding className="px-2 flex-none">
          <DialogTitle>{title}</DialogTitle>
        </Block>

        <Block>
          <EditDocument row={editingRow} schema={schema} tableName={tableName} />
        </Block>
      </DialogContent>
    </Dialog>
  );
};

export default AddTableDialogButton;
