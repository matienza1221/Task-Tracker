import { apiGet } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { CalendarData, CalendarFilters } from './types';

export const fetchCalendar = (filters: CalendarFilters) =>
  apiGet<CalendarData>(`/calendar${toQueryString({ ...filters })}`);
