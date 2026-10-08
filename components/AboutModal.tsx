import React from 'react';
import { X } from 'lucide-react';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[100] p-4 font-['Cairo']" 
            onClick={onClose} 
            dir="rtl"
        >
            <div 
                className="bg-gray-50 p-6 rounded-2xl shadow-2xl w-full max-w-2xl relative max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <button 
                    onClick={onClose} 
                    className="absolute top-3 left-3 bg-gray-200 p-2 rounded-full text-gray-700 hover:bg-gray-300 transition-colors z-10"
                    aria-label="إغلاق"
                >
                    <X size={24} />
                </button>
                
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-cyan-600 mb-6">
                        ✨ تربوي تك – المدراء ✨
                    </h2>

                    <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-12 my-8">
                        {/* Hussein Jihad Reda */}
                        <div className="flex flex-col items-center">
                            <div className="relative p-1 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 shadow-lg">
                                <img 
                                    src="https://i.imgur.com/Qrfhafs.png" 
                                    alt="اعداد الاستاذ حسين جهاد رضا" 
                                    className="w-32 h-32 md:w-36 md:h-36 rounded-full object-cover border-4 border-white"
                                />
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-gray-600">اعداد الاستاذ</h3>
                            <p className="text-xl font-bold text-cyan-600">حسين جهاد رضا</p>
                        </div>

                        {/* Tahseen Haroun Mahdi */}
                        <div className="flex flex-col items-center">
                             <div className="relative p-1 rounded-full bg-gradient-to-tr from-purple-400 to-indigo-500 shadow-lg">
                                <img 
                                    src="https://i.imgur.com/jDSB6Ry.png" 
                                    alt="اشراف الأستاذ حسنين علي هادي" 
                                    className="w-32 h-32 md:w-36 md:h-36 rounded-full object-cover border-4 border-white"
                                />
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-gray-600">اشراف الأستاذ</h3>
                            <p className="text-xl font-bold text-purple-600">حسنين علي هادي</p>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-xl shadow-inner border text-gray-700 text-lg leading-relaxed space-y-4">
                        <p>
                            المنصة التعليمية الأوسع في العراق لإدارة المدارس بجميع مراحلها الدراسية.
                        </p>
                        <p>
                            نضع بين يديكم نظامًا متكاملًا يواكب التطور التكنولوجي، يخدم الكوادر التربوية ويعزز مسيرة طلابنا الأحبة.
                        </p>
                        <p>
                            يوفر النظام إدارة ذكية وشاملة لسجلات الطلاب والسجلات الإدارية للمرحلتين الابتدائية والثانوية، مع خاصية الطباعة والتعديل بسهولة واحترافية.
                        </p>
                        <p className="border-t pt-4 mt-4 border-gray-200">
                            💡 تم تطوير المنصة على يد الأستاذ <strong className="text-cyan-700">حسين جهاد رضا</strong>، وبإشراف مباشر ودعم كريم من مدير متوسطة بطل خيبر الأستاذ <strong className="text-purple-700">حسنين علي هادي</strong>، لنصنع معًا نقلة نوعية في الإدارة المدرسية نحو مستقبل أكثر تميزًا ورقيًا.
                        </p>
                    </div>

                    <div className="mt-8">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">اتصل بنا</h3>
                        <a 
                            href="https://wa.me/9647727554379" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-block hover:scale-110 transition-transform duration-300"
                            aria-label="Contact us on WhatsApp"
                        >
                            <img src="https://i.imgur.com/fvLkxRu.png" alt="WhatsApp" className="w-20 h-20" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}