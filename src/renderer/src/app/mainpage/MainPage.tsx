import SplitPane, { Pane } from 'react-split-pane'
import './mainpage.css'
import { Block, Button, Text, useMuiThemeContext } from '@cloudhub-ux/mui'
import React from 'react'
import Titlebar from '@src/renderer/app/mainpage/TitleBar'
import { SidebarNav } from '@src/renderer/app/sidebar/SidebarNav'
import { TabbedInterface } from './TabbedInterface'
import { cn } from '@src/renderer/utils/utils'
import useDatabaseContext from '@src/renderer/context/useDatabaseContext'
import ConnectionForm from '@src/renderer/app/sidebar/ConnectionForm'
import { colors } from '@src/renderer/theme'

function MainPage() {
  const { themeMode } = useMuiThemeContext()

  const { selectedConnection } = useDatabaseContext()

  const darkModeColor = '#282C3D'

  return (
    <Block
      className={cn(
        'min-h-screen rounded-lg overflow-hidden',
        themeMode === 'dark' ? `bg-[${darkModeColor}]` : ''
      )}
    >
      <Titlebar />
      <Block>
        <SplitPane
          split="vertical"
          defaultSize={parseInt(localStorage.getItem('top_area') || '200', 10)}
          onChange={(size) => localStorage.setItem('top_area', size.toString())}
        >
          <Pane initialSize="200px" className="">
            <SidebarNav />
          </Pane>

          <Pane
            style={{
              display: 'flex',
              flexDirection: 'column'
            }}
            className=""
          >
            {selectedConnection ? (
              <Block>
                <TabbedInterface />
              </Block>
            ) : (
              <Block center middle>
                <Block flex={false} style={{ width: 400 }} padding={20}>
                  <Block padding rounded>
                    <Text center darkGray>
                      No database server connected
                    </Text>
                  </Block>
                  <Block flex={false} row center middle>
                    <ConnectionForm
                      anchorComponent={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-center text-center font-normal m-2"
                        >
                          <span className="flex-grow truncate">New Connection</span>
                        </Button>
                      }
                    />
                  </Block>
                </Block>
              </Block>
            )}
          </Pane>
        </SplitPane>
      </Block>
    </Block>
  )
}

export default MainPage
