import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from '@cloudhub-ux/shadcn/esm/components/ui/tabs'
import {
  MdiClose,
  MdiCodeBraces,
  MdiFileDocumentOutline,
  MdiPlus,
  MdiTable,
  MdiTableOutline
} from '@cloudhub-ux-icons/mdi'
import { Block, Scrollbars } from '@cloudhub-ux/mui'
import useTabInterfaceContext from '@src/renderer/context/useTabInterfaceContext'
import SplitPane, { Pane } from 'react-split-pane'
import React from 'react'
import { cn } from '@src/renderer/utils/utils'
import EmptySpace from '@src/renderer/app/mainpage/EmptySpace'

type TabType =
  | 'query'
  | 'table_data'
  | 'table_document'
  | 'query_and_results'
  | 'table_structure'
  | 'view_structure'
  | 'view_data'

export function TabbedInterface() {
  const { tabs, activeTabId, closeTab, openQueryTab, dispatch } = useTabInterfaceContext()
  const [tabCount, setTabCount] = React.useState(0)

  const getTabIcon = (tabType: TabType) => {
    switch (tabType) {
      case 'table_data':
        return <MdiTableOutline size={16} className="mr-1 text-yellow-800" />
      case 'view_data':
        return <MdiFileDocumentOutline size={16} className="mr-1 text-cyan-700" />
      case 'table_structure':
        return <MdiTable size={16} className="mr-1 text-blue-700" />
      case 'query':
        return <MdiCodeBraces size={16} className="mr-1 text-green-700" />
      default:
        return null
    }
  }

  React.useEffect(() => {
    setTabCount(Object.values(tabs || {}).length)
  }, [Object.values(tabs || {}).length])

  return (
    <Tabs
      value={activeTabId || undefined}
      onValueChange={(tabId) => {}}
      className="w-full h-full flex flex-col "
    >
      <Block flex={false} row middle className="h-8 w-full">
        <TabsList className="h-8 w-full flex flex-row justify-start">
          <Scrollbars absolute className="overflow-x-auto h-8 w-full">
            <Block flex={false} row middle className="h-8 w-full">
              {Object.values(tabs || {}).map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  // className="rounded-t-lg h-8 border-t border-l border-r dark:border-gray-900"
                  className={cn(
                    'group relative inline-flex items-center justify-center whitespace-nowrap rounded-t-lg h-8 border-t border-l border-r dark:border-gray-900 px-3 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
                    'pr-8' // Add padding to the right to accommodate the close icon
                  )}
                  onClick={(e) => {
                    e.stopPropagation()

                    setTimeout(() => {
                      if (tab) {
                        dispatch((state) => ({
                          tabInterfaceContext: {
                            ...state.tabInterfaceContext,
                            activeTabId: tab.id
                          }
                        }))
                      }
                    }, 50)
                  }}
                >
                  {getTabIcon(tab.type)}
                  <span className="truncate max-w-[150px]">{tab.title}</span>
                  <span
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    tabIndex={0}
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab)
                    }}
                  >
                    <MdiClose size={16} />
                  </span>
                </TabsTrigger>
              ))}

              <Button
                variant="outline"
                className="ml-2 h-6 w-6"
                style={{
                  borderRadius: 50
                }}
                size="icon"
                onClick={() => openQueryTab()}
              >
                <MdiPlus size={16} className="h-6 w-6" />
              </Button>
            </Block>
          </Scrollbars>
        </TabsList>
      </Block>

      <Block className="flex-1 w-full">
        {Object.values(tabs || {}).map((tab, index) => {
          const hasQueryComponent = Object.keys(tab.queryComponent || {}).length > 0
          const hasResultsComponent = Object.keys(tab.resultsComponent || {}).length > 0

          return (
            <TabsContent key={`${tab.id}-${index}`} value={tab.id} className="flex-1 w-full ">
              {hasQueryComponent && (
                <SplitPane
                  split="horizontal"
                  defaultSize={parseInt(localStorage.getItem('query_results_area') || '200', 10)}
                  onChange={(size) => localStorage.setItem('query_results_area', size.toString())}
                >
                  <Pane initialSize="200px" className="">
                    <Block absolute>{tab.queryComponent}</Block>
                  </Pane>

                  <Pane className="">
                    <Block absolute>{tab.resultsComponent}</Block>
                  </Pane>
                </SplitPane>
              )}

              {!hasQueryComponent && hasResultsComponent && (
                <Block absolute>{tab.resultsComponent}</Block>
              )}
            </TabsContent>
          )
        })}

        {Object.values(tabs || {}).length === 0 && (
          <Block>
            <EmptySpace />
          </Block>
        )}
      </Block>
    </Tabs>
  )
}
