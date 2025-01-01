import React from 'react'
import { Block, useMuiThemeContext } from '@cloudhub-ux/mui'

import { DrawerButton } from '@cloudhub-ux/mui/dist/widgets'

import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'
import { MdiDarkMode, MdiLightMode, MdiSettings, MdiSettingsOutline } from '@cloudhub-ux-icons/mdi'
import Scrollbar from '@cloudhub-ux/min/src/components/scrollbar'
import { Stack, Typography } from '@mui/material'
import { BaseOption } from './BaseOption'

const PguiSettingsButton = () => {
  const dlgRef = React.useRef(0)

  const { themeMode, setThemeMode } = useMuiThemeContext()

  const labelStyles = {
    mb: 1.5,
    color: 'text.disabled',
    fontWeight: 'fontWeightSemiBold'
  }

  const renderMode = (
    <div>
      <Typography variant="caption" component="div" sx={{ ...labelStyles }}>
        Mode
      </Typography>

      <BaseOption
        label="Dark mode"
        icon={<MdiDarkMode />}
        tooltip="Dark mode"
        selected={themeMode === 'dark'}
        onChange={() => {
          setThemeMode(themeMode === 'dark' ? 'light' : 'dark')
        }}
      />
    </div>
  )

  return (
    <DrawerButton
      ref={dlgRef}
      style={{ width: 500 }}
      anchorComponent={
        <Button
          variant="outline"
          size="icon"
          className="h-4 w-4 m-2"
          onClick={() => {
            console.log('clicked')
          }}
        >
          <MdiSettingsOutline className="text-muted-foreground" />
        </Button>
      }
      title="Settings"
    >
      <Block>
        <Scrollbar>
          <Stack spacing={3} sx={{ p: 3 }}>
            {renderMode}
          </Stack>
        </Scrollbar>
      </Block>
    </DrawerButton>
  )
}

export default PguiSettingsButton
