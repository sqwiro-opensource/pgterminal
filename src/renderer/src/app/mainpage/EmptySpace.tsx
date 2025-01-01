import React from 'react'
import { Block, Text } from '@cloudhub-ux/mui'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { cn } from '@src/renderer/utils/utils'

function EmptySpace(props) {
  const [] = React.useState(0)

  const commandSymbol = '⌘'

  const commandShortCuts = [
    { name: 'New Tab', keys: ['⌘', 'T'] },
    { name: 'Run', keys: ['⌘', 'Enter'] },
    { name: 'New Window', keys: ['⌘', '⇧', 'N'] },
    { name: 'Close Tab', keys: ['⌘', 'W'] },
    { name: 'Close Window', keys: ['⌘', '⇧', 'W'] },
    { name: 'Close All Tabs', keys: ['⌘', '⇧', 'W'] },
    { name: 'Close All Windows', keys: ['⌘', '⇧', 'W'] }
  ]

  return (
    <Block center middle>
      <Block flex={false} style={{ width: 300 }} padding={20}>
        {commandShortCuts.map((commandShortcut) => {
          return (
            <Block key={commandShortcut.name} row flex={false} center middle className="mb-2">
              <Block className="w-full mr-4">
                <Text right darkGray className="w-full text-md text-muted-foreground">
                  {commandShortcut.name}
                </Text>
              </Block>
              <Block row middle>
                {commandShortcut.keys.map((key) => {
                  return (
                    <Button
                      key={key}
                      variant="outline"
                      disabled
                      size="icon"
                      className={cn(
                        'ml-1 h-6 text-left text-md text-muted-foreground hover:bg-transparent',
                        key.length === 1 ? 'w-6' : 'w-auto px-2'
                      )}
                    >
                      {key}
                    </Button>
                  )
                })}
              </Block>
            </Block>
          )
        })}
      </Block>
    </Block>
  )
}

export default EmptySpace
