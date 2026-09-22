import { X } from 'lucide-react';

interface PastSessionModalProps {
    htmlContent: string;
    onClose: () => void;
}

export function PastSessionModal({ htmlContent, onClose }: PastSessionModalProps) {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
            <div className="bg-gray-900 border border-cyan-500/30 rounded-xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-cyan-900/20 p-4 border-b border-gray-800 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Past Session Data</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400 hover:text-white" />
                    </button>
                </div>

                {/* Content - Rendered HTML */}
                <div className="flex-1 bg-[#0b1020] overflow-hidden relative">
                    <iframe
                        title="Session Report"
                        srcDoc={htmlContent}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                </div>
            </div>
        </div>
    );
}
