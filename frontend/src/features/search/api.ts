import { apiGet } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { Project } from '../projects/types';
import type { Task } from '../tasks/types';

export interface SearchResults {
  tasks: Task[];
  projects: Project[];
}

export const fetchSearch = (query: string) => apiGet<SearchResults>(`/search${toQueryString({ q: query })}`);
