// src/renderer/src/components/ConnectionForm.tsx
import React, { useState } from 'react';
import { Form, Field } from '@cloudhub-ux/mui/dist/form';
import {
  Alert,
  AsyncStorage,
  Block,
  FieldBlock,
  Input,
  LoadingButton,
  Scrollbars
} from '@cloudhub-ux/mui';
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button';
import { Database, ChevronRight, MoreVertical } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@cloudhub-ux/shadcn/esm/components/ui/dialog';
import { MdiPlus } from '@cloudhub-ux-icons/mdi';
import useDatabaseContext from '@src/renderer/context/useDatabaseContext';
import TableColumnsForm from './TableColumnsForm';
import { StaticListSelector } from '@cloudhub-ux/mui/dist/mui';
import { SimpleTable } from '@src/renderer/app/components/document/tables';
import { Checkbox } from '@cloudhub-ux/shadcn/src/components/ui/checkbox';
import useSelectedDatabaseContext from '../../context/useSelectedDatabaseContext';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@cloudhub-ux/shadcn/src/components/ui/table';

interface SavedConnection {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export const AddTableDialogButton: React.FC<{
  schema?: string;
  anchorComponent?: React.ReactNode;
}> = ({ schema, anchorComponent }) => {
  const [loading, setLoading] = useState(false);
  const dlgRef = React.useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { selectedConnection, reload, dbQuery } = useSelectedDatabaseContext();

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Block row>
        {Anchor || (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-left font-normal m-2"
            onClick={() => setOpen(true)}
          >
            <MdiPlus size={16} className="mr-2 h-4 w-4" />
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
          <DialogTitle>Create Table</DialogTitle>
        </Block>

        <Form
          onSubmit={createTable}
          initialValues={{
            columns: {
              column1: {
                id: 'column1',
                name: 'column1',
                type: 'TEXT',
                default: '',
                nullable: false
              }
            }
          }}
          render={({ handleSubmit, form, values }) => {
            return (
              <>
                <Field
                  label="Table Name"
                  name="tableName"
                  component={Input}
                  onTextChange={(text) => {
                    form.change('tableName', `${text}`.replace(/ /g, '_'));
                  }}
                  required
                />
                <Block>
                  <Scrollbars absolute>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Default Value</TableHead>
                          <TableHead>Nullable</TableHead>
                          <TableHead>Primary Key</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.values(values.columns || {}).map((column) => (
                          <TableRow key={column.id}>
                            <TableCell className="font-medium">
                              <Field
                                name={`columns.${column.id}.name`}
                                component={Input}
                                onTextChange={(text) => {
                                  form.change(
                                    `columns.${column.id}.name`,
                                    `${text}`.replace(/ /g, '_')
                                  );
                                }}
                                required
                                props={{
                                  inputStyles: {
                                    width: 200
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Field
                                name={`columns.${column.id}.type`}
                                component={StaticListSelector}
                                containerStyle={{
                                  width: 200
                                }}
                                options={[
                                  // POSTGRESQL TYPES
                                  'TEXT',
                                  'INTEGER',
                                  'BOOLEAN',
                                  'FLOAT',
                                  'DATE',
                                  'TIME',
                                  'TIMESTAMP',
                                  'ARRAY',
                                  'JSON',
                                  'JSONB'
                                ]}
                              />
                            </TableCell>
                            <TableCell>
                              <Field name={`columns.${column.id}.default`} component={Input} />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={Boolean(column.primary)}
                                onClick={() => {
                                  form.change(`columns.${column.id}.primary`, !column.primary);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={Boolean(column.nullable)}
                                onClick={() => {
                                  form.change(`columns.${column.id}.nullable`, !column.nullable);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                className="p-0"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const indexes = Object.keys(values.columns || {}).map((key) =>
                                    Number(key.replace('column', ''))
                                  );
                                  const lastIndex = Math.max(...indexes);

                                  const newIndex = lastIndex + 1;

                                  form.change(`columns.column${newIndex}`, {
                                    id: `column${newIndex}`,
                                    name: `column${newIndex}`,
                                    type: 'TEXT',
                                    default: '',
                                    nullable: false,
                                    primary: false
                                  });
                                }}
                              >
                                <MdiPlus />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Scrollbars>
                </Block>
                <Block flex={false} row right>
                  <LoadingButton loading={loading} onClick={handleSubmit} contained small>
                    Create
                  </LoadingButton>
                </Block>
              </>
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default AddTableDialogButton;
