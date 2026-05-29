import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ShellLanguageOption = {
  code: 'zh-CN' | 'en-US' | 'es-ES' | 'fr-FR'
  label: string
}

type ShellLanguageContextValue = {
  activeLanguage: ShellLanguageOption
  availableLanguages: ShellLanguageOption[]
  setActiveLanguage: (code: ShellLanguageOption['code']) => void
}

const SHELL_LANGUAGE_OPTIONS: ShellLanguageOption[] = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en-US', label: 'English' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
]

const DEFAULT_LANGUAGE = SHELL_LANGUAGE_OPTIONS[0]
const STORAGE_KEY = 'arena_shell_language'

function readStoredCode(): ShellLanguageOption['code'] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SHELL_LANGUAGE_OPTIONS.some((opt) => opt.code === stored)) {
      return stored as ShellLanguageOption['code']
    }
  } catch {
    // localStorage 不可用时静默回退
  }
  return DEFAULT_LANGUAGE.code
}

const ShellLanguageContext = createContext<ShellLanguageContextValue | undefined>(undefined)

export function ShellLanguageProvider({ children }: { children: ReactNode }) {
  const [activeLanguageCode, setActiveLanguageCode] = useState<ShellLanguageOption['code']>(readStoredCode)

  function handleSetActiveLanguage(code: ShellLanguageOption['code']) {
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      // localStorage 不可用时仍更新 state
    }
    setActiveLanguageCode(code)
  }

  const value = useMemo<ShellLanguageContextValue>(() => {
    const activeLanguage = SHELL_LANGUAGE_OPTIONS.find((language) => language.code === activeLanguageCode)
      ?? DEFAULT_LANGUAGE

    return {
      activeLanguage,
      availableLanguages: SHELL_LANGUAGE_OPTIONS,
      setActiveLanguage: handleSetActiveLanguage,
    }
  }, [activeLanguageCode])

  return (
    <ShellLanguageContext.Provider value={value}>
      {children}
    </ShellLanguageContext.Provider>
  )
}

export function useShellLanguage() {
  const context = useContext(ShellLanguageContext)

  if (!context) {
    throw new Error('useShellLanguage must be used within ShellLanguageProvider')
  }

  return context
}
