import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api';
import { UserProfile } from '../types';
import { SafeImage } from './StatusText';

interface GeneratedImageRecord {
  id: number;
  prompt: string;
  category: string;
  aspect_ratio: string;
  image_path: string;
  model_used: string;
  created_at: string;
}

const SAFETY_PRESETS = [
  {
    label: 'PPE at Steel Plant',
    category: 'PPE Compliance',
    prompt: 'Worker wearing full PPE including yellow hard hat, safety goggles, reflective vest, and leather gloves inside a modern steel plant.',
  },
  {
    label: 'Unsafe Scaffolding Condition',
    category: 'Scaffolding',
    prompt: 'Construction scaffolding missing mid-rails and toe boards with loose planks, clear educational hazard inspection photograph.',
  },
  {
    label: 'Welding Safety',
    category: 'Hot Work & Fire Safety',
    prompt: 'Industrial welder wearing auto-darkening welding helmet, leather apron, gauntlet gloves with fire blanket and fire extinguisher nearby.',
  },
  {
    label: 'Work at Height',
    category: 'Work at Height',
    prompt: 'Technician working at height on steel structure wearing double-lanyard full body safety harness anchored to overhead lifeline.',
  },
  {
    label: 'Electrical LOTO Safety',
    category: 'Electrical Safety',
    prompt: 'Electrical engineer applying Lockout Tagout padlock on industrial switchgear breaker panel wearing insulated gloves and arc-flash face shield.',
  },
  {
    label: 'Fire Safety Station',
    category: 'Fire Safety',
    prompt: 'Industrial fire point with mounted ABC and CO2 fire extinguishers, fire hose reel, and clear yellow floor markings.',
  },
  {
    label: 'Industrial Housekeeping',
    category: 'Housekeeping',
    prompt: 'Clean factory shop floor with marked yellow pedestrian walkways, organized tool shadow board, and unobstructed emergency exit.',
  },
  {
    label: 'Crane & Lifting Safety',
    category: 'Lifting & Crane Safety',
    prompt: 'Overhead crane lifting steel beam with certified wire rope slings, 5-meter taglines held by riggers outside barricaded exclusion zone.',
  },
  {
    label: 'Confined Space Entry',
    category: 'Confined Space',
    prompt: 'Confined space entry team with rescue tripod, gas detector monitoring, standby attendant logbook, and manhole barricading.',
  },
];

export function AiImageGeneratorView({ user }: { user: UserProfile }) {
  const canGenerate = user.role !== 'Viewer';
  const [prompt, setPrompt] = useState(SAFETY_PRESETS[0].prompt);
  const [category, setCategory] = useState(SAFETY_PRESETS[0].category);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1' | '3:4'>('16:9');
  const [generating, setGenerating] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<GeneratedImageRecord | null>(null);
  const [history, setHistory] = useState<GeneratedImageRecord[]>([]);
  const [errorMsg, setErrorMsg] = useState<{ en: string; hi?: string } | null>(null);

  async function loadHistory() {
    try {
      const res = await apiFetch<{ images: GeneratedImageRecord[] }>('/api/ai/generated-images');
      setHistory(res.images);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleGenerate() {
    setErrorMsg(null);
    if (!prompt.trim() || prompt.trim().length < 5) {
      setErrorMsg({
        en: 'Please enter a descriptive industrial safety prompt.',
        hi: 'कृपया कम से कम 5 अक्षरों का सुरक्षा चित्र विवरण लिखें।',
      });
      return;
    }

    setGenerating(true);
    try {
      const res = await apiFetch<{ record: GeneratedImageRecord }>('/api/ai/generate-image', {
        method: 'POST',
        body: JSON.stringify({ prompt, category, aspectRatio }),
      });
      setCurrentRecord(res.record);
      setHistory((prev) => [res.record, ...prev]);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg({ en: err.message, hi: err.hindiMessage });
      } else {
        setErrorMsg({
          en: err instanceof Error ? err.message : 'Image generation failed.',
          hi: 'AI इमेज जनरेशन वर्तमान में उपलब्ध नहीं है।',
        });
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/api/ai/generated-images/${id}`, { method: 'DELETE' });
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (currentRecord?.id === id) setCurrentRecord(null);
    } catch (err) {
      setErrorMsg({ en: err instanceof Error ? err.message : 'Delete failed.' });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          AI Safety Training Image Generator
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Generate custom industrial safety visuals for Toolbox Talks, training decks, and hazard posters.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold">{errorMsg.en}</p>
            {errorMsg.hi && <p className="text-red-700">{errorMsg.hi}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900">
            Prompt &amp; Safety Scenario
          </h2>

          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Quick Scenario Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {SAFETY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setPrompt(preset.prompt);
                    setCategory(preset.category);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    prompt === preset.prompt
                      ? 'bg-[#0B2545] text-white border-[#0B2545]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Safety Image Prompt
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={!canGenerate}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Describe the industrial safety scenario to visualize..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="16:9">16:9 Landscape</option>
                <option value="4:3">4:3 Standard</option>
                <option value="1:1">1:1 Square</option>
                <option value="3:4">3:4 Poster</option>
              </select>
            </div>
          </div>

          {canGenerate ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-2.5 px-4 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <ImagePlus className="w-4 h-4 text-amber-400" />
              {generating ? 'Generating Safety Image...' : 'Generate Image'}
            </button>
          ) : (
            <p className="text-xs text-slate-500">Viewer accounts have read-only gallery access.</p>
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">Generated Preview</h2>
            {currentRecord && (
              <div className="flex items-center gap-2">
                {canGenerate && (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                )}
                <a
                  href={currentRecord.image_path}
                  download={`SURAJ_HSE_IMG_${currentRecord.id}.png`}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-[#0B2545] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PNG
                </a>
              </div>
            )}
          </div>

          {currentRecord ? (
            <div className="space-y-2">
              <SafeImage
                src={currentRecord.image_path}
                alt={currentRecord.prompt}
                className="w-full max-h-[380px] object-contain rounded-lg border border-slate-200 bg-slate-900"
              />
              <p className="text-xs text-slate-600">
                {currentRecord.category} · {currentRecord.aspect_ratio} · Model: {currentRecord.model_used}
              </p>
            </div>
          ) : (
            <div className="h-72 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center p-6">
              <ImagePlus className="w-10 h-10 text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700">No image generated in this session yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Select a safety scenario or write a custom prompt and click Generate Image. All real generated assets are archived automatically below.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Saved Generated Image Records */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-display text-base font-bold text-slate-900 mb-4">
          Saved Safety Image Library ({history.length})
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No generated images saved yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((img) => (
              <div key={img.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <div className="aspect-video bg-slate-900 overflow-hidden">
                  <SafeImage src={img.image_path} alt={img.prompt} className="w-full h-full object-cover" />
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-900 line-clamp-2">{img.prompt}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{img.category}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={img.image_path}
                        download={`SURAJ_HSE_IMG_${img.id}.png`}
                        className="text-blue-700 font-semibold hover:underline"
                      >
                        Download
                      </a>
                      {(user.role === 'Admin' || user.role === 'Safety Officer') && (
                        <button
                          onClick={() => handleDelete(img.id)}
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
