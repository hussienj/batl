/**
 * Teacher Color Configuration & Utilities for Weekly Schedule Manager
 * Provides prominent, high-contrast default colors and manual customization tools.
 */

export interface TeacherColorConfig {
    id: string;
    name?: string;
    bg: string;        // Light/pastel background for the cell
    text: string;      // High-contrast dark text color
    border: string;    // Matching border color
    accent: string;    // Vibrant solid color for teacher badge / indicator
    isCustom?: boolean;
}

/**
 * 30 Curated, vibrant, aesthetically balanced color palettes.
 * Each palette is designed to look great on screen with high readability.
 */
export const PRESET_TEACHER_PALETTES: TeacherColorConfig[] = [
    { id: 'sky', name: 'أزرق سماوي', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc', accent: '#0284c7' },
    { id: 'emerald', name: 'أخضر زمردي', bg: '#dcfce7', text: '#15803d', border: '#86efac', accent: '#16a34a' },
    { id: 'violet', name: 'بنفسجي ملكي', bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd', accent: '#7c3aed' },
    { id: 'amber', name: 'عنبري ذهبي', bg: '#fef3c7', text: '#b45309', border: '#fcd34d', accent: '#d97706' },
    { id: 'rose', name: 'وردي ياقوتي', bg: '#ffe4e6', text: '#9f1239', border: '#fda4af', accent: '#e11d48' },
    { id: 'teal', name: 'تركوازي بحري', bg: '#ccfbf1', text: '#0f766e', border: '#5eead4', accent: '#0d9488' },
    { id: 'indigo', name: 'نيلي داكن', bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc', accent: '#4f46e5' },
    { id: 'orange', name: 'برتقالي مشرق', bg: '#ffedd5', text: '#c2410c', border: '#fdba74', accent: '#ea580c' },
    { id: 'lime', name: 'ليموني زاهي', bg: '#ecfccb', text: '#4d7c0f', border: '#bef264', accent: '#65a30d' },
    { id: 'fuchsia', name: 'أرجواني فاقع', bg: '#fae8ff', text: '#a21caf', border: '#f0abfc', accent: '#c026d3' },
    { id: 'cyan', name: 'سماوي كاريبي', bg: '#cffafe', text: '#0e7490', border: '#67e8f9', accent: '#0891b2' },
    { id: 'coral', name: 'أحمر مرجاني', bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', accent: '#dc2626' },
    { id: 'mint', name: 'نعناعي منعش', bg: '#d1fae5', text: '#047857', border: '#6ee7b7', accent: '#059669' },
    { id: 'blue', name: 'أزرق كلاسيكي', bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', accent: '#2563eb' },
    { id: 'lilac', name: 'ليلكي هادئ', bg: '#fdf4ff', text: '#86198f', border: '#f5d0fe', accent: '#a21caf' },
    { id: 'slate', name: 'رصاصي فولاذي', bg: '#f1f5f9', text: '#334155', border: '#cbd5e1', accent: '#475569' },
    { id: 'caramel', name: 'كراميل دافئ', bg: '#fff7ed', text: '#9a3412', border: '#fed7aa', accent: '#c2410c' },
    { id: 'forest', name: 'أخضر غابي', bg: '#e6f4ea', text: '#137333', border: '#a8dab5', accent: '#188038' },
    { id: 'cobalt', name: 'كوبالت ملكي', bg: '#e8edff', text: '#1a365d', border: '#a3bffa', accent: '#2b6cb0' },
    { id: 'yellow', name: 'أصفر خردلي', bg: '#fefce8', text: '#854d0e', border: '#fef08a', accent: '#ca8a04' },
    { id: 'berry', name: 'توتي عميق', bg: '#f5d0fe', text: '#701a75', border: '#e879f9', accent: '#9333ea' },
    { id: 'peach', name: 'مشمشي ناعم', bg: '#fff1e6', text: '#a73a11', border: '#fcd34d', accent: '#f97316' },
    { id: 'olive', name: 'زيتوني فاتح', bg: '#f7fee7', text: '#3f6212', border: '#d9f99d', accent: '#84cc16' },
    { id: 'pink', name: 'وردي باربي', bg: '#fce7f3', text: '#be185d', border: '#f9a8d4', accent: '#db2777' },
    { id: 'seafoam', name: 'أكوا بحري', bg: '#e6fffa', text: '#234e52', border: '#81e6d9', accent: '#319795' },
    { id: 'lavender', name: 'خزامى هادئ', bg: '#f3e8ff', text: '#581c87', border: '#d8b4fe', accent: '#9333ea' },
    { id: 'terracotta', name: 'صلصالي قرميدي', bg: '#ffedd5', text: '#7c2d12', border: '#fdba74', accent: '#b45309' },
    { id: 'steel', name: 'فولاذي كحلي', bg: '#e2e8f0', text: '#1e293b', border: '#94a3b8', accent: '#334155' },
    { id: 'gold', name: 'ذهبي ملوكي', bg: '#fef9c3', text: '#713f12', border: '#fde047', accent: '#eab308' },
    { id: 'ruby', name: 'ياقوتي داكن', bg: '#ffe4e6', text: '#881337', border: '#fda4af', accent: '#be123c' }
];

/**
 * Generate a cohesive TeacherColorConfig from ANY custom hex color.
 */
export function generateColorFromHex(hex: string, name?: string): TeacherColorConfig {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) {
        cleanHex = '0284c7'; // fallback sky
    }

    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    // Calculate perceived luminance (0 to 1)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Helper: blend with white
    const blendWithWhite = (weight: number) => {
        const nr = Math.round(r * weight + 255 * (1 - weight));
        const ng = Math.round(g * weight + 255 * (1 - weight));
        const nb = Math.round(b * weight + 255 * (1 - weight));
        return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
    };

    // Helper: blend with black (darken)
    const darken = (weight: number) => {
        const nr = Math.round(r * (1 - weight));
        const ng = Math.round(g * (1 - weight));
        const nb = Math.round(b * (1 - weight));
        return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
    };

    let bg: string;
    let border: string;
    let text: string;
    const accent = `#${cleanHex}`;

    if (lum > 0.8) {
        // Very light color
        bg = accent;
        border = darken(0.2);
        text = darken(0.65);
    } else if (lum > 0.6) {
        // Moderately light
        bg = blendWithWhite(0.35);
        border = darken(0.1);
        text = darken(0.55);
    } else {
        // Vibrant or dark color
        bg = blendWithWhite(0.16); // Gentle pastel tint
        border = blendWithWhite(0.45);
        text = darken(0.25); // Dark readable text
    }

    return {
        id: `custom_${cleanHex}`,
        name: name || 'لون مخصص',
        bg,
        text,
        border,
        accent,
        isCustom: true
    };
}

/**
 * Get default deterministic color for a teacher based on index or hashing ID.
 */
export function getDefaultTeacherColor(teacherId: string, teacherIndex?: number): TeacherColorConfig {
    if (typeof teacherIndex === 'number' && teacherIndex >= 0) {
        const pal = PRESET_TEACHER_PALETTES[teacherIndex % PRESET_TEACHER_PALETTES.length];
        return { ...pal, id: `default_${teacherId}` };
    }

    // Hash teacherId to get deterministic index
    let hash = 0;
    for (let i = 0; i < teacherId.length; i++) {
        hash = (hash << 5) - hash + teacherId.charCodeAt(i);
        hash |= 0;
    }
    const idx = Math.abs(hash) % PRESET_TEACHER_PALETTES.length;
    const pal = PRESET_TEACHER_PALETTES[idx];
    return { ...pal, id: `default_${teacherId}` };
}

/**
 * Resolves the color for a teacher:
 * 1. Checks if teacherColors has an entry (custom, preset, or explicit 'none')
 * 2. If 'none', returns null (uncolored)
 * 3. If exists, returns custom color
 * 4. Otherwise, returns default prominent color based on teacher's index in teachers list
 */
export function resolveTeacherColor(
    teacherIdOrName: string,
    customColors: Record<string, TeacherColorConfig | null | 'none'>,
    teachers: { id: string; name: string }[]
): TeacherColorConfig | null {
    if (!teacherIdOrName) return null;

    // Find teacher
    let teacher = teachers.find(t => t.id === teacherIdOrName);
    if (!teacher) {
        teacher = teachers.find(t => t.name === teacherIdOrName);
    }

    const tId = teacher ? teacher.id : teacherIdOrName;
    const custom = customColors[tId];

    if (custom === 'none' || custom === null) {
        return null; // Explicitly uncolored / blank
    }

    if (custom && typeof custom === 'object' && custom.bg) {
        return custom;
    }

    // Default prominent color
    const tIndex = teacher ? teachers.indexOf(teacher) : -1;
    return getDefaultTeacherColor(tId, tIndex >= 0 ? tIndex : undefined);
}
