import Box from '@mui/material/Box'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import ButtonBase from '@mui/material/ButtonBase'
import { varAlpha } from '@cloudhub-ux/min/src/theme/styles'
import { MdiInfoOutline } from '@cloudhub-ux-icons/mdi'
import { hexToRgb, hexToRgba } from '@src/renderer/theme'

// ----------------------------------------------------------------------

type BaseOptionProps = {
  icon: React.ReactNode
  label: string
  tooltip?: string
  selected: boolean
  onChange: (newValue: string) => void
}

export function BaseOption({ icon, label, tooltip, selected, ...other }: BaseOptionProps) {
  return (
    <ButtonBase
      disableRipple
      sx={{
        px: 2,
        py: 2.5,
        borderRadius: 2,
        cursor: 'pointer',
        flexDirection: 'column',
        alignItems: 'flex-start',
        border: (theme) => {
          return `solid 1px ${hexToRgba(theme.palette.grey[500], 0.12)}`
        },
        '&:hover': { bgcolor: (theme) => hexToRgba(theme.palette.grey[500], 0.08) },
        ...(selected && {
          bgcolor: (theme) => hexToRgba(theme.palette.grey[500], 0.08)
        })
      }}
      {...other}
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        sx={{ width: 1, mb: 3 }}
      >
        {icon}
        <Switch name={label} size="small" color="default" checked={selected} sx={{ mr: -0.75 }} />
      </Box>

      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ width: 1 }}>
        <Box
          component="span"
          sx={{
            lineHeight: '18px',
            fontWeight: 'fontWeightSemiBold',
            fontSize: (theme) => theme.typography.pxToRem(13)
          }}
        >
          {label}
        </Box>

        {tooltip && (
          <Tooltip
            arrow
            title={tooltip}
            slotProps={{
              tooltip: { sx: { maxWidth: 240, mr: 0.5 } }
            }}
          >
            <MdiInfoOutline
              size={16}
              style={{ cursor: 'pointer' }}
              className="text-muted-foreground"
            />
          </Tooltip>
        )}
      </Box>
    </ButtonBase>
  )
}
