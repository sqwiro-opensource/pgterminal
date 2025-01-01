'use client'

import { ChevronRight, Database, FunctionSquare, Table, FileQuestion } from 'lucide-react'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@cloudhub-ux/shadcn/esm/components/ui/collapsible'
import { DatabaseSchema } from '@src/renderer/types/database'

interface DatabaseTreeProps {
  schema: DatabaseSchema
}

export function DatabaseTree({ schema }: DatabaseTreeProps) {
  return (
    <div className="space-y-2">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <ChevronRight className="h-4 w-4 shrink-0" />
            <Database className="mr-2 h-4 w-4" />
            <span className="text-sm">{schema.name}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pl-6 space-y-2">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <ChevronRight className="h-4 w-4 shrink-0" />
                <Table className="mr-2 h-4 w-4" />
                <span className="text-sm">Tables</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6">
              {schema.tables.map((table) => (
                <Button key={table.name} variant="ghost" size="sm" className="w-full justify-start">
                  <Table className="mr-2 h-4 w-4" />
                  <span className="text-sm">{table.name}</span>
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <ChevronRight className="h-4 w-4 shrink-0" />
                <FunctionSquare className="mr-2 h-4 w-4" />
                <span className="text-sm">Functions</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6">
              {schema.functions.map((fn) => (
                <Button key={fn.name} variant="ghost" size="sm" className="w-full justify-start">
                  <FunctionSquare className="mr-2 h-4 w-4" />
                  <span className="text-sm">{fn.name}</span>
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <ChevronRight className="h-4 w-4 shrink-0" />
                <FileQuestion className="mr-2 h-4 w-4" />
                <span className="text-sm">Saved Queries</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6">
              {schema.queries.map((query) => (
                <Button key={query.id} variant="ghost" size="sm" className="w-full justify-start">
                  <FileQuestion className="mr-2 h-4 w-4" />
                  <span className="text-sm">{query.name}</span>
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
