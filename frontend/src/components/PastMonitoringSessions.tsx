import { FileText } from 'lucide-react';

interface SessionSummary {
    avgP99?: number;
    maxSlippage?: number;
}

interface PastSession {
    _id: string;
    sessionStartedAt?: string;
    createdAt: string;
    summary?: SessionSummary;
    riskExposureUsd?: number;
}

interface PastMonitoringSessionsProps {
    reports: PastSession[];
    onViewReport: (id: string) => void;
}

export function PastMonitoringSessions({ reports, onViewReport }: PastMonitoringSessionsProps) {
    if (!reports || reports.length === 0) return null;

    return (
        <div className="card border-gray-700/50">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                Past Monitoring Sessions
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                {reports.map((session) => (
                    <div key={session._id} className="bg-gray-800/30 p-3 rounded border border-gray-800 flex items-center justify-between hover:border-gray-600 transition-colors">
                        <div>
                            <div className="text-[10px] text-gray-300 font-mono mb-1">
                                {new Date(session.sessionStartedAt || session.createdAt).toLocaleDateString()} • {new Date(session.sessionStartedAt || session.createdAt).toLocaleTimeString()}
                            </div>
                            <div className="flex gap-2">
                                {session.summary ? (
                                    <>
                                        <span className="text-[9px] px-1 rounded bg-cyan-900/30 text-cyan-400">
                                            Avg p99: {session.summary.avgP99?.toFixed(1) ?? 'N/A'}ms
                                        </span>
                                        <span className={`text-[9px] px-1 rounded ${session.summary.maxSlippage && session.summary.maxSlippage > 0.001 ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
                                            Max Slip: ${session.summary.maxSlippage?.toFixed(4) ?? 'N/A'}
                                        </span>
                                    </>
                                ) : session.riskExposureUsd ? (
                                    <span className={`text-[9px] px-1 rounded ${session.riskExposureUsd > 1000 ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
                                        Risk: ${session.riskExposureUsd?.toFixed(0)}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <button
                            onClick={() => onViewReport(session._id)}
                            className="p-1.5 hover:bg-gray-700 rounded text-cyan-400 transition-colors"
                            title="View Session Data"
                        >
                            <FileText className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
