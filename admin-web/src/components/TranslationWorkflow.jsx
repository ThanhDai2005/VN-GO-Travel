import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    fetchPoiTranslations, 
    upsertPoiTranslation, 
    deletePoiTranslation, 
    lockPoiTranslation, 
    unlockPoiTranslation,
    heartbeatPoiTranslation,
    rollbackPoiTranslation,
    fetchPoiTranslationHistory 
} from '../apiClient';

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' }
];

export default function TranslationWorkflow({ poiCode, baseContent, baseVersion }) {
    const [translations, setTranslations] = useState([]);
    const [selectedLang, setSelectedLang] = useState(LANGUAGES[0].code);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    
    // Safety & Audit State
    const [conflict, setConflict] = useState(null); 
    const [overwriteReason, setOverwriteReason] = useState('');
    const [lockStatus, setLockStatus] = useState({ status: 'checking', user: null });
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [jitCooldown, setJitCooldown] = useState(0);
    const [heartbeatError, setHeartbeatError] = useState(false);

    // Editor State
    const [initialForm, setInitialForm] = useState(null); 
    const [form, setForm] = useState({
        mode: 'partial',
        translationSource: 'manual',
        content: { name: '', summary: '', narrationShort: '', narrationLong: '' }
    });

    const [showDiff, setShowDiff] = useState(false);

    const loadTranslations = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchPoiTranslations(poiCode);
            setTranslations(res.data || []);
        } catch (e) {
            setError('Failed to load translations');
        } finally {
            setLoading(false);
        }
    }, [poiCode]);

    const acquireLock = useCallback(async (langCode) => {
        try {
            const res = await lockPoiTranslation(poiCode, langCode);
            setLockStatus(res.data);
            setHeartbeatError(false);
        } catch (e) {
            setLockStatus({ status: 'error' });
        }
    }, [poiCode]);

    useEffect(() => {
        loadTranslations();
    }, [loadTranslations]);

    // LOCK & HEARTBEAT Logic
    useEffect(() => {
        acquireLock(selectedLang);
        
        const heartbeatInterval = setInterval(async () => {
            if (lockStatus.status === 'acquired') {
                try {
                    await heartbeatPoiTranslation(poiCode, selectedLang);
                } catch (e) {
                    setHeartbeatError(true);
                }
            }
        }, 30000); // 30s heartbeat

        return () => {
            clearInterval(heartbeatInterval);
            unlockPoiTranslation(poiCode, selectedLang).catch(() => {});
        };
    }, [selectedLang, acquireLock, poiCode, lockStatus.status]);

    useEffect(() => {
        const existing = translations.find(t => t.lang_code === selectedLang);
        const data = existing ? {
            mode: existing.mode,
            translationSource: existing.translationSource,
            content: { ...existing.content }
        } : {
            mode: 'partial',
            translationSource: 'manual',
            content: { name: '', summary: '', narrationShort: '', narrationLong: '' }
        };
        
        setForm(data);
        setInitialForm(JSON.parse(JSON.stringify(data)));
        setConflict(null);
        setOverwriteReason('');
        setError('');
    }, [selectedLang, translations]);

    const isDirty = useMemo(() => {
        return initialForm && JSON.stringify(form) !== JSON.stringify(initialForm);
    }, [form, initialForm]);

    const completion = useMemo(() => {
        const fields = ['name', 'summary', 'narrationShort', 'narrationLong'];
        const filled = fields.filter(f => form.content[f]?.trim()).length;
        return {
            percent: (filled / fields.length) * 100,
            isComplete: filled === fields.length
        };
    }, [form.content]);

    const handleSave = async (force = false) => {
        if (force && !overwriteReason.trim()) {
            setError('Please provide a reason for overwriting.');
            return;
        }

        setError('');
        setSaving(true);
        try {
            const payload = {
                ...form,
                expectedBaseVersion: baseVersion,
                overwrite: force,
                overwriteReason: force ? overwriteReason : undefined
            };
            await upsertPoiTranslation(poiCode, selectedLang, payload);
            setInitialForm(JSON.parse(JSON.stringify(form)));
            setConflict(null);
            setOverwriteReason('');
            await loadTranslations();
            alert('Saved successfully.');
        } catch (e) {
            if (e.message?.includes('VERSION_CONFLICT')) {
                setConflict(true);
            } else if (e.status === 429) {
                const retryAfter = e.payload?.retryAfter || 60;
                setError(`Rate limit exceeded. Please wait ${retryAfter}s.`);
                setJitCooldown(retryAfter);
            } else {
                setError(e.message || 'Save failed');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleRollback = async (version) => {
        if (!window.confirm(`Rollback to version ${version}? This will create a new version.`)) return;
        setSaving(true);
        try {
            await rollbackPoiTranslation(poiCode, selectedLang, version);
            await loadTranslations();
            setShowHistory(false);
            alert('Rollback successful.');
        } catch (e) {
            setError('Rollback failed');
        } finally {
            setSaving(false);
        }
    };

    const loadHistory = async () => {
        try {
            const res = await fetchPoiTranslationHistory(poiCode, selectedLang);
            setHistory(res.data || []);
            setShowHistory(true);
        } catch (e) {
            setError('Failed to load history');
        }
    };

    useEffect(() => {
        if (jitCooldown > 0) {
            const timer = setTimeout(() => setJitCooldown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [jitCooldown]);

    const isLocked = lockStatus.status === 'locked';

    return (
        <div className="flex h-[750px] flex-col overflow-hidden rounded-xl bg-slate-900 text-slate-100 shadow-2xl">
            {/* Hardened Top Bar: Lock & Heartbeat Status */}
            <div className="flex h-12 items-center justify-between px-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    {isLocked ? (
                        <div className="flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-bold text-amber-500">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                            READ ONLY - LOCKED BY: {lockStatus.user}
                        </div>
                    ) : heartbeatError ? (
                        <div className="flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-[10px] font-bold text-red-500">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                            HEARTBEAT LOST - CONNECTION UNSTABLE
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-bold text-emerald-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            ACTIVE SESSION SECURED
                        </div>
                    )}
                </div>
                <div className="flex gap-4">
                    <button onClick={loadHistory} className="text-[10px] font-bold text-slate-500 hover:text-slate-300">VIEW HISTORY</button>
                    {isDirty && !isLocked && <span className="text-[10px] font-bold text-amber-500 animate-pulse uppercase">Unsaved Changes</span>}
                </div>
            </div>

            {conflict && (
                <div className="bg-red-600 p-6 text-sm">
                    <div className="flex items-center gap-4 font-bold">
                        <span>⚠️ VERSION CONFLICT: Base content was updated.</span>
                    </div>
                    <div className="mt-4 flex flex-col gap-3">
                        <textarea 
                            placeholder="Reason for forcing overwrite..."
                            value={overwriteReason}
                            onChange={e => setOverwriteReason(e.target.value)}
                            className="rounded border-none bg-black/20 p-3 text-sm text-white placeholder:text-white/40 outline-none"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setConflict(null)} className="rounded bg-white/20 px-4 py-2 font-bold hover:bg-white/30">Cancel</button>
                            <button onClick={() => handleSave(true)} className="rounded bg-white px-4 py-2 font-bold text-red-600 hover:bg-slate-100">Force Save</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-56 border-r border-slate-800 bg-slate-950 p-4">
                    <div className="space-y-1">
                        {LANGUAGES.map(lang => {
                            const t = translations.find(x => x.lang_code === lang.code);
                            const t_comp = t ? (Object.values(t.content).filter(v => v?.trim()).length / 4) * 100 : 0;
                            const isSelected = selectedLang === lang.code;
                            
                            return (
                                <button
                                    key={lang.code}
                                    onClick={() => !isDirty || window.confirm('Discard changes?') ? setSelectedLang(lang.code) : null}
                                    className={`group flex w-full flex-col rounded-lg px-3 py-2 text-left transition-all ${isSelected ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800'}`}
                                >
                                    <div className="flex w-full items-center justify-between">
                                        <span className="text-sm font-medium">{lang.name}</span>
                                        <StatusDot t={t} currentBaseVersion={baseVersion} />
                                    </div>
                                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                                        <div className={`h-full transition-all ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} style={{ width: `${t_comp}%` }} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Editor */}
                <div className="relative flex flex-1 flex-col overflow-y-auto bg-slate-900 p-6">
                    {/* History Sidebar with Rollback */}
                    {showHistory && (
                        <div className="absolute right-0 top-0 z-20 h-full w-80 border-l border-slate-800 bg-slate-950 p-6 shadow-2xl transition-transform">
                            <div className="mb-6 flex items-center justify-between">
                                <h3 className="font-bold">SNAPSHOT HISTORY</h3>
                                <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white">✕</button>
                            </div>
                            <div className="space-y-4 overflow-y-auto">
                                {history.map(h => (
                                    <div key={h._id} className="group relative rounded-lg border border-slate-800 p-3 text-[11px] bg-slate-900 hover:border-emerald-500/50">
                                        <div className="mb-2 flex justify-between font-bold text-emerald-400">
                                            <span>v{h.version}</span>
                                            <span>{new Date(h.createdAt).toLocaleString()}</span>
                                        </div>
                                        <div className="text-slate-400 line-clamp-2">{h.snapshot.content.summary}</div>
                                        <div className="mt-2 flex items-center justify-between">
                                            <div className="text-[9px] text-slate-500 uppercase">By {h.createdBy?.name || 'Admin'}</div>
                                            <button 
                                                onClick={() => handleRollback(h.version)}
                                                className="hidden rounded bg-emerald-600 px-2 py-1 text-[9px] font-bold text-white group-hover:block"
                                            >
                                                RESTORE
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold">Editing {LANGUAGES.find(l => l.code === selectedLang)?.name}</h2>
                            <div className="mt-1 flex gap-4 text-xs text-slate-500">
                                <span>Status: <strong className="text-emerald-400">{completion.percent}% Complete</strong></span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setShowDiff(!showDiff)} 
                                className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${showDiff ? 'bg-emerald-500 text-white' : 'border border-slate-700 hover:bg-slate-800'}`}
                            >
                                {showDiff ? 'Hide Diff' : 'Compare Current'}
                            </button>
                            <button 
                                disabled={jitCooldown > 0 || isLocked}
                                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold hover:bg-slate-800 disabled:opacity-30"
                            >
                                {jitCooldown > 0 ? `AI Cooling (${jitCooldown}s)` : 'AI Suggest'}
                            </button>
                        </div>
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="rounded-xl bg-slate-950 p-4 shadow-inner">
                                <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Source: Vietnamese (v{baseVersion})</h4>
                                <div className="space-y-4">
                                    <StaticField label="Original Name" value={baseContent.name} />
                                    <StaticField label="Original Summary" value={baseContent.summary} />
                                    <StaticField label="Short Narration" value={baseContent.narrationShort} />
                                    <StaticField label="Long Narration" value={baseContent.narrationLong} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between rounded-xl border border-slate-800 p-4 bg-slate-950/30">
                                <div className="flex gap-4">
                                    <ModeBtn active={form.mode === 'partial'} onClick={() => !isLocked && setForm(f=>({...f, mode:'partial'}))} label="Partial" />
                                    <ModeBtn active={form.mode === 'full'} onClick={() => !isLocked && setForm(f=>({...f, mode:'full'}))} label="Full (Strict)" />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <InputField 
                                    label="Translated Name" 
                                    value={form.content.name} 
                                    initial={initialForm?.content?.name}
                                    showDiff={showDiff}
                                    disabled={isLocked}
                                    onChange={v => setForm(f => ({...f, content: {...f.content, name: v}}))}
                                />
                                <InputField 
                                    label="Translated Summary" 
                                    value={form.content.summary} 
                                    initial={initialForm?.content?.summary}
                                    showDiff={showDiff}
                                    disabled={isLocked}
                                    onChange={v => setForm(f => ({...f, content: {...f.content, summary: v}}))}
                                />
                                <InputField 
                                    label="Short Narration" 
                                    value={form.content.narrationShort} 
                                    initial={initialForm?.content?.narrationShort}
                                    showDiff={showDiff}
                                    textarea
                                    disabled={isLocked}
                                    onChange={v => setForm(f => ({...f, content: {...f.content, narrationShort: v}}))}
                                />
                                <InputField 
                                    label="Long Narration" 
                                    value={form.content.narrationLong} 
                                    initial={initialForm?.content?.narrationLong}
                                    showDiff={showDiff}
                                    textarea
                                    disabled={isLocked}
                                    onChange={v => setForm(f => ({...f, content: {...f.content, narrationLong: v}}))}
                                />
                            </div>

                            {error && <div className="rounded border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">{error}</div>}

                            <button
                                onClick={() => handleSave()}
                                disabled={saving || !isDirty || isLocked}
                                className="group relative w-full overflow-hidden rounded-xl bg-emerald-600 py-4 font-bold text-white transition-all hover:bg-emerald-500 disabled:opacity-20"
                            >
                                <span className="relative z-10">{saving ? 'COMMITING...' : isLocked ? 'LOCKED (VIEW ONLY)' : 'COMMIT TRANSLATION'}</span>
                                <div className="absolute inset-0 translate-y-full bg-white/10 transition-transform group-hover:translate-y-0" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusDot({ t, currentBaseVersion }) {
    if (!t) return <div className="h-2 w-2 rounded-full bg-slate-700" />;
    const isOutdated = t.metadata?.baseVersion < currentBaseVersion;
    if (isOutdated) return <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />;
    return <div className="h-2 w-2 rounded-full bg-emerald-500" />;
}

function StaticField({ label, value }) {
    return (
        <div>
            <div className="text-[9px] font-bold uppercase text-slate-600">{label}</div>
            <div className="mt-1 text-sm text-slate-300">{value || '—'}</div>
        </div>
    );
}

function ModeBtn({ active, onClick, label }) {
    return (
        <button 
            onClick={onClick}
            className={`rounded px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
            {label}
        </button>
    );
}

function InputField({ label, value, initial, onChange, textarea, showDiff, disabled }) {
    const hasChanged = initial !== undefined && value !== initial;
    
    return (
        <div className="group relative">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
                {hasChanged && <span className="text-[9px] font-bold text-emerald-400 uppercase">MODIFIED</span>}
            </div>
            
            <div className="relative">
                {textarea ? (
                    <textarea
                        value={value}
                        disabled={disabled}
                        onChange={e => onChange(e.target.value)}
                        rows={5}
                        className={`w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm outline-none transition-all focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 ${hasChanged ? 'border-emerald-900/50 ring-1 ring-emerald-900/20' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                ) : (
                    <input
                        value={value}
                        disabled={disabled}
                        onChange={e => onChange(e.target.value)}
                        className={`w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm outline-none transition-all focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 ${hasChanged ? 'border-emerald-900/50 ring-1 ring-emerald-900/20' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                )}

                {showDiff && hasChanged && (
                    <div className="mt-2 rounded-lg bg-red-950/30 p-3 text-[11px] leading-relaxed text-red-200 border border-red-900/30 shadow-inner">
                        <div className="mb-1 text-[9px] font-bold uppercase text-red-400 opacity-60">PREVIOUS VALUE:</div>
                        {initial || '[Empty]'}
                    </div>
                )}
            </div>
        </div>
    );
}
