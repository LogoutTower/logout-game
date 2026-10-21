// Feature flags: 'off' | 'gm' | 'all' (true = 'all', false = 'off'). Pure.
export const featureOn = (flags, name, isGm = false) => { const v = flags?.[name] || 'off'; return v === 'all' || v === true || (v === 'gm' && !!isGm); };
