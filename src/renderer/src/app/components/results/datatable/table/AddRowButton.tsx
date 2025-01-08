// src/renderer/src/components/ConnectionForm.tsx
import React, { useState } from 'react';

import { Alert, Block, toastr } from '@cloudhub-ux/mui';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import { MdiPlus, MdiSave } from '@cloudhub-ux-icons/mdi';
import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import MonacoJsonEditor from '../../../editor/MonacoJsonEditor';

const formatValue = (value: any) => {
  switch (typeof value) {
    case 'string':
      return `'${value.replace(/'/g, "''")}'`;
    case 'number':
      return value;
    case 'object':
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    default:
      return value;
  }
};

export const AddRowButton: React.FC<{
  schema?: string;
  anchorComponent?: React.ReactNode;
  editingRow?: any;
  tableName?: string;
  onRowAdded?: (row: any) => void;
}> = ({ schema, anchorComponent, editingRow = {}, tableName }) => {
  const dlgRef = React.useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { selectedConnection, editing, dispatch, reload, dbQuery } = useSelectedDatabaseContext();

  const [value, setValue] = useState<string>(JSON.stringify(editingRow || {}, null, 2));

  const handleEditorChange = (value: string) => {
    setValue(value);
  };

  const onRowAdded = async () => {
    const tabId = `table_data/${schema}.${tableName}`;

    const { data } = await dbQuery(`SELECT * FROM ${schema}.${tableName} LIMIT 100`);

    console.log('reload data', data);

    if (data) {
      dispatch((state) => ({
        tabInterfaceContext: {
          ...state.tabInterfaceContext,
          tabs: {
            ...state.tabInterfaceContext.tabs,
            [tabId]: {
              ...state.tabInterfaceContext.tabs[tabId],
              resultsState: {
                ...state.tabInterfaceContext.tabs[tabId].resultsState,
                data
              }
            }
          }
        }
      }));
    }
  };

  const handleSave = async () => {
    let valuesToCreate = {};
    setError('');

    try {
      valuesToCreate = JSON.parse(value);
    } catch (error) {
      console.error(error);
    }

    const columns = Object.keys(valuesToCreate).map((key) => `"${key}"`);
    const values = Object.values(valuesToCreate).map((value) => formatValue(value));

    const insertSql = `INSERT INTO ${schema}.${tableName} (${columns.join(',')}) VALUES (${values.join(',')}) RETURNING *`;

    const { data, error } = await dbQuery(insertSql);

    if (error) {
      setError(error);
      return;
    }

    if (data && Array.isArray(data) && data.length === 1) {
      const newRow = data[0];
      if (typeof onRowAdded === 'function') {
        onRowAdded(newRow);
      }
      toastr.success('Row added successfully');
    }

    setOpen(false);
  };

  React.useEffect(() => {
    setValue(JSON.stringify(editingRow || {}, null, 2));
  }, [JSON.stringify(editingRow || {})]);

  const getAnchor = () => {
    if (anchorComponent) {
      return React.cloneElement(anchorComponent, {
        onClick: () => setOpen(true)
      });
    }

    return null;
  };

  const Anchor = getAnchor();

  const title = 'Add Row';

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
          <DialogTitle>
            <Block row>
              <Block>{title}</Block>

              <Block flex={false}>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-green-300 text-black"
                  onClick={handleSave}
                >
                  <MdiSave size={16} />
                  Save
                </Button>
              </Block>
            </Block>
          </DialogTitle>
        </Block>

        <Alert error message={error} onClose={() => setError('')} />

        <Block>
          <MonacoJsonEditor
            value={value}
            options={{
              minimap: { enabled: false },
              readOnly: false
            }}
            onChange={handleEditorChange}
          />
        </Block>
      </DialogContent>
    </Dialog>
  );
};

export default AddRowButton;
