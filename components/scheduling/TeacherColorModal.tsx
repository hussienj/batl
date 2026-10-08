import React, { useState, useMemo } from 'react';
import type { User } from '../../types.ts';
import {
    Palette,
    Check,
    RotateCcw,
    Sparkles,
    Trash2,
    X,
    Search,
    Eye,
    EyeOff,
    SlidersHorizontal,
    Pipette
} from 'lucide-react';
import {
    TeacherColorConfig,
    PRESET_TEACHER_PALETTES,
    generateColorFromHex,
    getDefaultTeacherColor,
    resolveTeacherColor
} from './teacherColorUtils.ts';

interface TeacherColorModalProps {
    isOpen: boolean;
    onClose: () => void;
    teachers: User[];
    teacherColors: Record<string, TeacherColorConfig | null | 'none'>;
    enableTeacherColors: boolean;
    onUpdateTeacherColor: (teacherId: string, color: TeacherColorConfig | null | 'none') => void;
    onResetAllToDefault: () => void;
    onClearAllColors: () => void;
    onToggleEnableColors: (enabled: boolean) => void;
    onSave: () => Promise<void>;
    isSaving?: boolean;
}

export default function TeacherColorModal({
    isOpen,
    onClose,
    teachers,
    teacherColors,
    enableTeacherColors,
    onUpdateTeacherColor,
    onResetAllToDefault,
    onClearAllColors,
    onToggleEnableColors,
    onSave,
    isSaving = false
}: TeacherColorModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

    // Filtered teachers list
    const filteredTeachers = useMemo(() => {
        if (!searchQuery.trim()) return teachers;
        const q = searchQuery.trim().toLowerCase();
        return teachers.filter(t => t.name.toLowerCase().includes(q));
    }, [teachers, searchQuery]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[140] p-3 sm:p-4" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-5 bg-gradient-to-l from-indigo-900 via-blue-900 to-cyan-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-yellow-300 shadow-md">
                            <Palette size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg sm:text-xl font-black">
                                تخصيص وتحديد ألوان المدرسين في الجدول
                            </h3>
                            <p className="text-xs text-blue-200 mt-0.5 font-medium">
                                ألوان افتراضية بارزة ومميزة لكل مدرس مع إمكانية التعديل اليدوي أو تفريغ الألوان
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition cursor-pointer"
                        title="إغلاق النافذة"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Master Action & Settings Bar */}
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-sm">
                    {/* Enable / Disable Table Colors Master Switch */}
                    <div className="flex items-center gap-2.5 bg-white px-3.5 py-2 rounded-2xl border border-gray-200 shadow-2xs">
                        <span className="text-xs font-black text-gray-800">تفعيل تلوين الجدول:</span>
                        <button
                            type="button"
                            onClick={() => onToggleEnableColors(!enableTeacherColors)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                                enableTeacherColors
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                            {enableTeacherColors ? (
                                <>
                                    <Eye size={14} />
                                    <span>مفعّل ومضاء 🎨</span>
                                </>
                            ) : (
                                <>
                                    <EyeOff size={14} />
                                    <span>مفرّغ (بلا ألوان) ⚪</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Bulk Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Clear All Colors (تفريغ ألوان الجدول) */}
                        <button
                            type="button"
                            onClick={onClearAllColors}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition cursor-pointer"
                            title="تفريغ ألوان الجدول وجعل كافة خلايا المدرسين بيضاء غير ملونة"
                        >
                            <Trash2 size={14} />
                            <span>تفريغ ألوان الجدول بالكامل</span>
                        </button>

                        {/* Reset All to Default Prominent Colors (استعادة الألوان الافتراضية) */}
                        <button
                            type="button"
                            onClick={onResetAllToDefault}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-black transition cursor-pointer"
                            title="إعادة تعيين الألوان الافتراضية البارزة والمميزة لجميع المدرسين تلقائياً"
                        >
                            <RotateCcw size={14} />
                            <span>استعادة الألوان الافتراضية البارزة</span>
                        </button>
                    </div>
                </div>

                {/* Quick Search & Count Filter */}
                <div className="px-5 py-3 bg-white border-b border-gray-100 flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="بحث باسم المدرس..."
                            className="w-full pr-9 pl-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        />
                    </div>
                    <span className="text-xs font-bold text-gray-500">
                        إجمالي الكادر التدريسي: ({teachers.length} مدرس)
                    </span>
                </div>

                {/* Teachers List & Color Pickers */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3.5 bg-gray-50/50">
                    {filteredTeachers.length === 0 ? (
                        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
                            لا يوجد مدرس بهذا الاسم
                        </div>
                    ) : (
                        filteredTeachers.map((teacher, idx) => {
                            const currentColor = resolveTeacherColor(teacher.id, teacherColors, teachers);
                            const isExplicitlyNone = teacherColors[teacher.id] === 'none';
                            const isDefault = !teacherColors[teacher.id];

                            return (
                                <div
                                    key={teacher.id}
                                    className={`p-3.5 bg-white rounded-2xl border transition-all shadow-2xs hover:shadow-sm ${
                                        selectedTeacherId === teacher.id
                                            ? 'border-blue-500 ring-2 ring-blue-200'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                        {/* Teacher Info & Preview Badge */}
                                        <div className="flex items-center gap-3 min-w-[200px]">
                                            <div
                                                className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-xs"
                                                style={currentColor && enableTeacherColors ? {
                                                    backgroundColor: currentColor.accent,
                                                    color: '#ffffff'
                                                } : {
                                                    backgroundColor: '#e2e8f0',
                                                    color: '#475569'
                                                }}
                                            >
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                                                    {teacher.name}
                                                    {isDefault && (
                                                        <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded-md border border-cyan-200">
                                                            افتراضي بارز
                                                        </span>
                                                    )}
                                                    {isExplicitlyNone && (
                                                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200">
                                                            مفرّغ
                                                        </span>
                                                    )}
                                                    {currentColor?.isCustom && (
                                                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200">
                                                            يدوي مخصص
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-[11px] text-gray-500 font-medium">
                                                    {teacher.email || 'مدرس'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Visual Preview of the Cell */}
                                        <div className="shrink-0 flex items-center gap-2">
                                            <span className="text-[11px] font-bold text-gray-400">معاينة الخلية:</span>
                                            <div
                                                className="px-3 py-1.5 rounded-xl border text-center min-w-[130px] transition-all"
                                                style={currentColor && enableTeacherColors ? {
                                                    backgroundColor: currentColor.bg,
                                                    borderColor: currentColor.border,
                                                    borderWidth: '2px',
                                                    borderLeftWidth: '5px',
                                                    borderLeftColor: currentColor.accent
                                                } : {
                                                    backgroundColor: '#ffffff',
                                                    borderColor: '#e5e7eb',
                                                    borderWidth: '1px'
                                                }}
                                            >
                                                <span
                                                    className="block font-black text-xs"
                                                    style={{ color: currentColor && enableTeacherColors ? currentColor.text : '#1f2937' }}
                                                >
                                                    رياضيات
                                                </span>
                                                <span
                                                    className="inline-block text-[10px] font-bold px-1.5 py-0.2 rounded-md mt-0.5"
                                                    style={currentColor && enableTeacherColors ? {
                                                        backgroundColor: currentColor.accent,
                                                        color: '#ffffff'
                                                    } : {
                                                        backgroundColor: '#f3f4f6',
                                                        color: '#4b5563'
                                                    }}
                                                >
                                                    {teacher.name}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Controls: Presets Swatches + Custom Picker + Actions */}
                                        <div className="flex items-center gap-2 flex-wrap md:justify-end">
                                            {/* Quick Popular Palettes Swatches */}
                                            <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200">
                                                {PRESET_TEACHER_PALETTES.slice(0, 7).map(pal => (
                                                    <button
                                                        key={pal.id}
                                                        type="button"
                                                        onClick={() => onUpdateTeacherColor(teacher.id, pal)}
                                                        className={`w-6 h-6 rounded-lg transition-transform cursor-pointer relative ${
                                                            currentColor?.accent === pal.accent ? 'scale-115 ring-2 ring-gray-900 z-10' : 'hover:scale-110'
                                                        }`}
                                                        style={{ backgroundColor: pal.accent }}
                                                        title={pal.name}
                                                    >
                                                        {currentColor?.accent === pal.accent && (
                                                            <Check size={12} className="text-white absolute inset-0 m-auto stroke-[3]" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Native Color Picker (Pick Any Custom Color) */}
                                            <label
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 cursor-pointer shadow-2xs transition"
                                                title="اختيار أي لون يدوي مخصص من لوحة الألوان"
                                            >
                                                <Pipette size={14} className="text-indigo-600" />
                                                <span>لون مخصص</span>
                                                <input
                                                    type="color"
                                                    value={currentColor?.accent || '#0284c7'}
                                                    onChange={(e) => {
                                                        const custom = generateColorFromHex(e.target.value);
                                                        onUpdateTeacherColor(teacher.id, custom);
                                                    }}
                                                    className="w-5 h-5 rounded cursor-pointer opacity-0 absolute pointer-events-none"
                                                />
                                            </label>

                                            {/* Clear Color for this Teacher (تفريغ اللون) */}
                                            <button
                                                type="button"
                                                onClick={() => onUpdateTeacherColor(teacher.id, 'none')}
                                                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                                                    isExplicitlyNone
                                                        ? 'bg-rose-100 text-rose-800 border-rose-300 font-black'
                                                        : 'bg-white hover:bg-rose-50 text-rose-600 border-gray-200'
                                                }`}
                                                title="جعل خانات هذا المدرس بيضاء مفرغة من الألوان"
                                            >
                                                تفريغ اللون
                                            </button>

                                            {/* Reset to Default for this Teacher */}
                                            {!isDefault && (
                                                <button
                                                    type="button"
                                                    onClick={() => onUpdateTeacherColor(teacher.id, null)}
                                                    className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition cursor-pointer"
                                                    title="إلغاء التخصيص والعودة للون الافتراضي البارز"
                                                >
                                                    <RotateCcw size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Bar */}
                <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-gray-600 font-medium">
                        <Sparkles size={16} className="text-amber-500" />
                        <span>يتم تطبيق الألوان فوراً على الجدول العام الشامل وعلى جدول الشعبة.</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition cursor-pointer"
                        >
                            إغلاق
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                await onSave();
                                onClose();
                            }}
                            disabled={isSaving}
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 active:scale-95 text-white rounded-xl text-xs font-black shadow-md transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? (
                                <span>جارِ الحفظ...</span>
                            ) : (
                                <>
                                    <Check size={16} className="text-yellow-300 stroke-[3]" />
                                    <span>حفظ وتطبيق الألوان</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
