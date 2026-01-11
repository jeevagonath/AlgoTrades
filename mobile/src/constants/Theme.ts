export const Theme = {
    colors: {
        background: '#020617', // Deep slate/navy
        surface: '#0f172a',    // Dark slate
        card: '#1e293b',       // Slate

        // Neon Accents
        primary: '#3b82f6',    // Blue
        secondary: '#0ea5e9',  // Sky
        success: '#10b981',    // Emerald
        error: '#ef4444',      // Rose
        warning: '#f59e0b',    // Amber

        // Glassmorphism tokens
        glass: 'rgba(30, 41, 59, 0.7)',
        glassBorder: 'rgba(255, 255, 255, 0.1)',
        glow: 'rgba(59, 130, 246, 0.15)',

        // Text
        text: '#f8fafc',
        textMuted: '#94a3b8',
        textDim: '#64748b',

        // Borders
        border: '#1e293b',
        borderLight: '#334155',
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
    },
    radius: {
        sm: 8,
        md: 12,
        lg: 20,
        xl: 28,
        full: 999,
    },
    shadows: {
        glow: {
            shadowColor: '#3b82f6',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 10,
            elevation: 5,
        }
    }
};
