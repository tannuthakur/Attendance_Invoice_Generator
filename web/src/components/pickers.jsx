import { api, fetchAllPages } from '../api';
import { useAsync } from './ui';

export const loadEmployees = (query) => fetchAllPages('/employees', query);
export const loadProjects = () => api('/projects');

export function EmployeeSelect({ value, onChange, includeOffRole = true, placeholder = 'Select employee…', required, id }) {
  const { data = [], loading } = useAsync(() => loadEmployees(includeOffRole ? {} : { status: 'on_role' }), [includeOffRole]);
  return (
    <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} required={required} disabled={loading}>
      <option value="">{loading ? 'Loading…' : placeholder}</option>
      {data.map((e) => (
        <option key={e.id} value={e.id}>
          {e.fullName} ({e.employeeCode}){e.employmentStatus === 'off_role' ? ' · off role' : ''}
        </option>
      ))}
    </select>
  );
}

/** Loads all projects, unless a `projects` list is passed in. */
export function ProjectSelect({ projects, ...props }) {
  return projects ? <ProjectOptions list={projects} {...props} /> : <LoadedProjectSelect {...props} />;
}

function LoadedProjectSelect(props) {
  const { data = [], loading } = useAsync(loadProjects, []);
  return <ProjectOptions list={data} loading={loading} {...props} />;
}

function ProjectOptions({ list, loading = false, value, onChange, placeholder = 'Select project…', required, id }) {
  return (
    <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} required={required} disabled={loading}>
      <option value="">{loading ? 'Loading…' : placeholder}</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}{p.clientName ? ` · ${p.clientName}` : ''}
        </option>
      ))}
    </select>
  );
}
