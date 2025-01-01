'use client'

import { useAppStore } from '@cloudhub-ux/zstore'
import { IInitialState } from './INITIAL_STATE'

const useAppContext = useAppStore<IInitialState>()

export default useAppContext
