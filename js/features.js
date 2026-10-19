// Feature flags: 'off' | 'gm' | 'all'. Pure.
export const featureOn = (flags, name, isGm = false) => { const v = flags?.[name] || 'off'; return v === 'all' || (v === 'gm' && !!isGm); };
