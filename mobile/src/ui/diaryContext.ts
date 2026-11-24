import { createContext, useContext } from 'react';
import type { AnxietyLog, Entry } from '../types';
import type { useDiary } from '../useDiary';

export type DiaryContextValue = ReturnType<typeof useDiary> & {
  reviewDate: string;
  setReviewDate: (date: string) => void;
  reviewQuery: string;
  setReviewQuery: (query: string) => void;
  openWriter: (entry?: Entry, date?: string, kind?: 'good') => void;
  openAnxiety: (log?: AnxietyLog) => void;
};

export const DiaryContext = createContext<DiaryContextValue | null>(null);

export function useDiaryContext(): DiaryContextValue {
  const context = useContext(DiaryContext);
  if (!context) throw new Error('DiaryProvider is missing');
  return context;
}
