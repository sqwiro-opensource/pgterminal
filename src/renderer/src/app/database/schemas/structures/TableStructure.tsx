import React from 'react';
import { Block } from '@cloudhub-ux/mui';

import { Button } from '@cloudhub-ux/shadcn/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@cloudhub-ux/shadcn/src/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@cloudhub-ux/shadcn/src/components/ui/tabs';

import useSelectedDatabaseContext from '@src/renderer/app/database/context/useSelectedDatabaseContext';
import TableColumns from '@src/renderer/app/database/schemas/structures/TableColumns';
import TableIndexes from '@src/renderer/app/database/schemas/structures/TableIndexes';
import TableTriggers from '@src/renderer/app/database/schemas/structures/TableTriggers';
import TableRelations from '@src/renderer/app/database/schemas/structures/TableRelations';

function TableStructure({
  schemaName,
  tableName,
  tabId
}: {
  schemaName: string;
  tableName: string;
  tabId: string;
}) {
  const { schemas } = useSelectedDatabaseContext();
  const schema = schemas[schemaName];
  const table = schema.tables.tableList[tableName];

  const columns = table.columns.columnList;
  const indexes = table.indexes.indexList;
  const triggers = table.triggers.triggerList;
  const relations = table.relations.relationList;

  return (
    <Block padding={10} center>
      <Tabs defaultValue="columns" className="w-full flex-1 flex flex-col">
        <Block row flex={false} center>
          <Block flex={false} row center>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="columns">Columns</TabsTrigger>
              <TabsTrigger value="indexes">Indexes</TabsTrigger>
              <TabsTrigger value="triggers">Triggers</TabsTrigger>
              <TabsTrigger value="relations">Relations</TabsTrigger>
            </TabsList>
          </Block>
        </Block>
        <TabsContent value="columns" className="flex-1 flex flex-col data-[state=inactive]:hidden">
          <Card className="flex-1 m-4 flex flex-col">
            <CardHeader>
              <CardTitle>{`Columns`}</CardTitle>
              <CardDescription>{`${schemaName}.${tableName}`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 flex-1 flex">
              <TableColumns
                columns={columns}
                tabId={tabId}
                schema={schemaName}
                tableName={tableName}
              />
            </CardContent>
            <CardFooter>
              <Button>Save changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="indexes" className="flex-1 flex flex-col data-[state=inactive]:hidden">
          <Card className="flex-1 m-4 flex flex-col ">
            <CardHeader>
              <CardTitle>Indexes</CardTitle>
              <CardDescription>{`${schemaName}.${tableName}`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 flex-1 flex">
              <TableIndexes
                indexes={indexes}
                tabId={tabId}
                schema={schemaName}
                tableName={tableName}
              />
            </CardContent>
            <CardFooter>
              <Button>Save changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="triggers" className="flex-1 flex flex-col data-[state=inactive]:hidden">
          <Card className="flex-1 m-4 flex flex-col ">
            <CardHeader>
              <CardTitle>Triggers</CardTitle>
              <CardDescription>{`${schemaName}.${tableName}`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 flex-1 flex">
              <TableTriggers
                triggers={triggers}
                tabId={tabId}
                schema={schemaName}
                tableName={tableName}
              />
            </CardContent>
            <CardFooter>
              <Button>Save changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent
          value="relations"
          className="flex-1 flex flex-col data-[state=inactive]:hidden"
        >
          <Card className="flex-1 m-4 flex flex-col ">
            <CardHeader>
              <CardTitle>Relations</CardTitle>
              <CardDescription>{`${schemaName}.${tableName}`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 flex-1 flex">
              <TableRelations
                relations={relations}
                tabId={tabId}
                schema={schemaName}
                tableName={tableName}
              />
            </CardContent>
            <CardFooter>
              <Button>Save changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </Block>
  );
}

export default TableStructure;
