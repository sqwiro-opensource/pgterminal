// src/components/Titlebar.tsx
import React from 'react'
import { X, Minus, Square } from 'lucide-react'
import { MdiClose } from '@cloudhub-ux-icons/mdi/dist/MdiClose'
import { MdiMinus } from '@cloudhub-ux-icons/mdi/dist/MdiMinus'
import { MdiMinimize } from '@cloudhub-ux-icons/mdi/dist/MdiMinimize'
import { MdiCloseRounded, MdiExpandContent } from '@cloudhub-ux-icons/mdi'
import { Block, useMuiThemeContext } from '@cloudhub-ux/mui'
import PguiSettingsButton from '@src/renderer/app/mainpage/settings/PguiSettingsButton'
import { cn } from '@src/renderer/utils/utils'

interface TitlebarProps {
  title?: string
}

const Titlebar: React.FC<TitlebarProps> = ({ title = 'PGUI' }) => {
  const [isFocused, setIsFocused] = React.useState(true)

  const { themeMode } = useMuiThemeContext()

  React.useEffect(() => {
    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => setIsFocused(false)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const handleMinimize = () => {
    if (window.electron) {
      window.electron.minimize()
    }
  }

  const handleMaximize = () => {
    if (window.electron) {
      window.electron.maximize()
    }
  }

  const handleClose = () => {
    if (window.electron) {
      window.electron.close()
    }
  }

  return (
    <div
      className={cn(
        'h-8 flex items-center px-2 select-none border-b overflow-hidden',
        themeMode === 'dark' ? 'bg-[#282C3D] border-[#15395b]' : ''
      )}
      style={{ WebkitAppRegion: 'drag', overflow: 'hidden' }}
    >
      {/* Left section - Window controls */}
      <div className="flex items-center gap-1.5 px-1 group" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Close */}
        <button
          onClick={handleClose}
          className="inline-flex items-center justify-center h-3 w-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 focus:outline-none group"
          title="Close"
        >
          <MdiCloseRounded className="opacity-0 group-hover:opacity-100 group-hover:text-black" />
        </button>

        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="inline-flex items-center justify-center h-3 w-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 focus:outline-none group"
          title="Minimize"
        >
          <MdiMinus className="opacity-0 group-hover:opacity-100 group-hover:text-black" />
        </button>
        {/* Maximize */}
        <button
          onClick={handleMaximize}
          className="inline-flex items-center justify-center h-3 w-3 rounded-full bg-[#28c841] hover:bg-[#28c841]/80 focus:outline-none group"
          title="Maximize"
        >
          <MdiExpandContent className="opacity-0 group-hover:opacity-100 group-hover:text-black" />
        </button>
      </div>

      {/* Center section - App title */}
      <div className="flex-1 text-center">
        <span className="text-sm font-semibold text-gray-300">{title}</span>
      </div>

      <Block flex={false} style={{ WebkitAppRegion: 'no-drag' }}>
        <PguiSettingsButton />
      </Block>
    </div>
  )
}

export default Titlebar
