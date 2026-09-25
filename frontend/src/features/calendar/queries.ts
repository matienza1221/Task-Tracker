import { useQuery } from '@tanstack/react-query';
import { fetchCalendar } from './api';
import type { CalendarFilters } from './types';

export const calendarKeys = {
  range: (filters: CalendarFilters) => ['calendar', filters] as const,
};

export function useCalendar(filters: CalendarFilters, enabled = true) {
  return useQuery({
    queryKey: calendarKeys.range(filters),
    queryFn: () => fetchCalendar(filters),
    enabled: enabled && Boolean(filters.from) && Boolean(filters.to),
    placeholderData: (previous) => previous,
  });
}
