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

export const AddColumnButton: React.FC<{
  schema?: string;
  anchorComponent?: React.ReactNode;
  editingRow?: any;
  tableName?: string;
}> = ({ schema, anchorComponent, editingRow = {}, tableName }) => {
  const [loading, setLoading] = useState(false);
  const dlgRef = React.useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { selectedConnection, editing, dispatch, reload, dbQuery } = useSelectedDatabaseContext();

  React.useEffect(() => {
    if (editing) {
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

  const getAnchor = () => {
    if (anchorComponent) {
      return React.cloneElement(anchorComponent, {
        onClick: () => setOpen(true)
      });
    }

    return null;
  };

  const Anchor = getAnchor();

  const title = 'Edit Column';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Block row>
        {Anchor || (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(true)}>
            <MdiPlus size={16} className="" />
          </Button>
        )}
      </Block>

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

export default AddColumnButton;
