'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useResolvedTaxMenu } from '@/app/utils/useResolvedTaxMenu';

type MenuPrefsContextValue = ReturnType<typeof useResolvedTaxMenu>;

const MenuPrefsContext = createContext<MenuPrefsContextValue | null>(null);

export function MenuPrefsProvider({ children }: { children: ReactNode }) {
  const value = useResolvedTaxMenu();
  return <MenuPrefsContext.Provider value={value}>{children}</MenuPrefsContext.Provider>;
}

export function useMenuPrefs(): MenuPrefsContextValue {
  const ctx = useContext(MenuPrefsContext);
  if (!ctx) {
    throw new Error('useMenuPrefs must be used within MenuPrefsProvider');
  }
  return ctx;
}
