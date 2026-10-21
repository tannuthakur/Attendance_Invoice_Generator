const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);

export const icons = {
  dashboard: <Icon d={['M3 13h8V3H3z', 'M13 21h8V11h-8z', 'M3 21h8v-6H3z', 'M13 9h8V3h-8z']} />,
  employees: <Icon d={['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75']} />,
  projects: <Icon d={['M3 7h18v13H3z', 'M8 7V4h8v3']} />,
  attendance: <Icon d={['M3 5h18v16H3z', 'M16 3v4', 'M8 3v4', 'M3 10h18', 'M9 15l2 2 4-4']} />,
  holidays: <Icon d={['M3 5h18v16H3z', 'M16 3v4', 'M8 3v4', 'M3 10h18', 'M12 13.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z']} />,
  invoices: <Icon d={['M14 3H6a2 2 0 0 0-2 2v16l3-2 2 2 3-2 3 2 2-2 3 2V8z', 'M14 3v5h5', 'M8 13h8', 'M8 17h5']} />,
  users: <Icon d={['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1', 'M19 8l1.5 1.5L23 7']} />,
  profile: <Icon d={['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1']} />,
  logout: <Icon d={['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9']} />,
  options: <Icon d={['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M20 18h0', 'M16 4v4', 'M10 10v4', 'M18 16v4']} />,
  menu: <Icon d={['M3 6h18', 'M3 12h18', 'M3 18h18']} />,
};
