export const PRIMARY_ROLES = [
  'power_admin',
  'power_ceo',
  'power_legal',
  'power_analyst',
  'power_ingestion',
  'power_team',
  'power_ai',
  'power_app',
] as const;

export const roleDisplayNames: Record<string, string> = {
  power_admin: 'System Admin',
  power_ceo: 'Chief Executive Officer (CEO)',
  power_legal: 'Legal Team',
  power_analyst: 'Research Analyst',
  power_ingestion: 'Data Ingestion',
  power_team: 'General Staff',
  power_ai: 'AI Service',
  power_app: 'Application',
  // Fallbacks for standard legacy role keys
  admin: 'System Admin',
  ceo: 'Chief Executive Officer (CEO)',
  legal: 'Legal Team',
  analyst: 'Research Analyst',
};

export function getRoleDisplayName(role: string | null | undefined): string {
  if (!role) return 'General Staff';
  const cleanKey = role.trim().toLowerCase();
  return roleDisplayNames[cleanKey] || roleDisplayNames[`power_${cleanKey}`] || role;
}
