import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Printer,
  Save,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { ApiError, apiFetch, downloadAuthorizedFile } from '../lib/api';
import { Observation, SAFETY_CATEGORIES, UserProfile } from '../types';
import { RiskText } from './StatusText';

interface AiObservationViewProps {
  user: UserProfile;
  onSaved: () => void;
}

interface EditableObservationForm {
  location: string;
  agencyName: string;
  jobExecutor: string;
  workActivity: string;
  category: string;
  language: 'Bilingual' | 'English' | 'Hindi';
  title: string;
  photoSummary: string;
  observationType: 'Unsafe Act' | 'Unsafe Condition' | 'Both' | 'Positive Observation';
  detectedCategory: string;
  hazard: string;
  potentialConsequence: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' | 'Needs Verification';
  correctiveAction: string;
  preventiveAction: string;
  precaution: string;
  responsiblePerson: string;
  siteVerification: string;
  observationEnglish: string;
  hindiExplanation: string;
  targetDate: string;
}

export function AiObservationView({ user, onSaved }: AiObservationViewProps) {
  const canEdit = user.role !== 'Viewer';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [imagePreview, setImagePreview] = useState<string>('');
  const [savedPhotoPath, setSavedPhotoPath] = useState<string>('');
  const [savedObsId, setSavedObsId] = useState<number | null>(null);
  const [savedObsCode, setSavedObsCode] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<{ en: string; hi?: string } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const defaultTarget = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState<EditableObservationForm>({
    location: '',
    agencyName: '',
    jobExecutor: '',
    workActivity: '',
    category: 'Auto',
    language: 'Bilingual',
    title: '',
    photoSummary: '',
    observationType: 'Unsafe Condition',
    detectedCategory: 'General Industrial Safety',
    hazard: '',
    potentialConsequence: '',
    riskLevel: 'Needs Verification',
    correctiveAction: '',
    preventiveAction: '',
    precaution: '',
    responsiblePerson: '',
    siteVerification: '',
    observationEnglish: '',
    hindiExplanation: '',
    targetDate: defaultTarget,
  });

  const [hasAnalysis, setHasAnalysis] = useState(false);

  function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setErrorMsg(null);
    setSuccessMsg('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg({
        en: 'Please select a JPEG, PNG, or WEBP image.',
        hi: 'कृपया केवल JPEG, PNG या WEBP फोटो चुनें।',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg({
        en: 'Image size must be under 10MB.',
        hi: 'फोटो का आकार 10MB से कम होना चाहिए।',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            setImagePreview(canvas.toDataURL('image/jpeg', 0.88));
          } else {
            setImagePreview(rawDataUrl);
          }
        } else {
          setImagePreview(rawDataUrl);
        }
        setSavedPhotoPath('');
        setSavedObsId(null);
        setSavedObsCode('');
      };
      img.onerror = () => {
        setImagePreview(rawDataUrl);
        setSavedPhotoPath('');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function openLiveCamera() {
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setCameraStream(stream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      // Fallback to native mobile camera file input
      cameraInputRef.current?.click();
    }
  }

  function closeCamera() {
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setCameraOpen(false);
  }

  function captureFrame() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setImagePreview(dataUrl);
      setSavedPhotoPath('');
      setSavedObsId(null);
      setSavedObsCode('');
    }
    closeCamera();
  }

  async function handleAnalyze() {
    setErrorMsg(null);
    setSuccessMsg('');
    if (!imagePreview) {
      setErrorMsg({
        en: 'Please upload or capture a site photo before running AI analysis.',
        hi: 'AI विश्लेषण चलाने से पहले कृपया साइट की फोटो अपलोड या कैप्चर करें।',
      });
      return;
    }

    setAnalyzing(true);
    try {
      const res = await apiFetch<{
        photoPath: string;
        analysis: {
          title: string;
          photoSummary: string;
          observationType: EditableObservationForm['observationType'];
          detectedCategory: string;
          hazard: string;
          potentialConsequence: string;
          riskLevel: EditableObservationForm['riskLevel'];
          correctiveAction: string;
          preventiveAction: string;
          precaution: string;
          responsiblePerson: string;
          siteVerification: string;
          observationEnglish: string;
          hindiExplanation: string;
        };
      }>('/api/ai/analyze-observation', {
        method: 'POST',
        body: JSON.stringify({
          imageDataUrl: imagePreview,
          existingPhotoPath: savedPhotoPath,
          location: form.location,
          agencyName: form.agencyName,
          jobExecutor: form.jobExecutor,
          workActivity: form.workActivity,
          category: form.category,
          language: form.language,
        }),
      });

      setSavedPhotoPath(res.photoPath);
      setForm((prev) => ({
        ...prev,
        ...res.analysis,
      }));
      setHasAnalysis(true);
      setSavedObsId(null);
      setSavedObsCode('');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg({ en: err.message, hi: err.hindiMessage });
      } else {
        setErrorMsg({
          en: err instanceof Error ? err.message : 'AI analysis failed.',
          hi: 'AI विश्लेषण विफल रहा। आपका डेटा सुरक्षित है, कृपया पुनः प्रयास करें।',
        });
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveObservationToDb(): Promise<Observation | null> {
    setErrorMsg(null);
    if (!form.title.trim() || !form.location.trim() || !form.hazard.trim() || !form.correctiveAction.trim()) {
      setErrorMsg({
        en: 'Please complete Location, Title, Hazard, and Corrective Action before saving.',
        hi: 'सहेजने से पहले कृपया स्थान (Location), शीर्षक, खतरा और सुधारात्मक कार्रवाई भरें।',
      });
      return null;
    }

    setSaving(true);
    try {
      let photoPathToUse = savedPhotoPath;
      if (!photoPathToUse && imagePreview.startsWith('data:image/')) {
        const up = await apiFetch<{ path: string }>('/api/upload-base64', {
          method: 'POST',
          body: JSON.stringify({ dataUrl: imagePreview }),
        });
        photoPathToUse = up.path;
        setSavedPhotoPath(up.path);
      }

      const res = await apiFetch<{ observation: Observation }>('/api/observations', {
        method: 'POST',
        body: JSON.stringify({
          location: form.location,
          agency_name: form.agencyName || 'In-House',
          job_executor: form.jobExecutor || user.full_name,
          work_activity: form.workActivity || 'Site Inspection',
          category: form.detectedCategory || (form.category === 'Auto' ? 'General Industrial Safety' : form.category),
          observation_type: form.observationType,
          title: form.title,
          photo_summary: form.photoSummary,
          details: form.observationEnglish,
          details_hi: form.hindiExplanation,
          hazard: form.hazard,
          potential_consequence: form.potentialConsequence,
          risk_level: form.riskLevel,
          corrective_action: form.correctiveAction,
          preventive_action: form.preventiveAction,
          precaution: form.precaution,
          responsible_person: form.responsiblePerson || form.jobExecutor || 'Site Supervisor',
          site_verification: form.siteVerification,
          target_date: form.targetDate,
          status: 'Open',
          photo_path: photoPathToUse,
          site_supervisor_name: form.jobExecutor || user.full_name,
        }),
      });

      setSavedObsId(res.observation.id);
      setSavedObsCode(res.observation.obs_code);
      setSuccessMsg(`Saved as ${res.observation.obs_code} in Observation Register.`);
      onSaved();
      return res.observation;
    } catch (err) {
      setErrorMsg({ en: err instanceof Error ? err.message : 'Save failed.' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    let obsId = savedObsId;
    if (!obsId) {
      const created = await saveObservationToDb();
      if (!created) return;
      obsId = created.id;
    }
    await downloadAuthorizedFile(`/api/export/pdf/observation/${obsId}`, `SURAJ_HSE_OBS_${obsId}.pdf`);
  }

  async function handleDownloadCardPng() {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `SURAJ_HSE_OBSERVATION_${savedObsCode || Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setErrorMsg({ en: 'Could not render image download. Try saving and downloading PDF instead.' });
    }
  }

  async function handleExportExcel() {
    if (!savedObsId) {
      const created = await saveObservationToDb();
      if (!created) return;
    }
    await downloadAuthorizedFile('/api/export/excel/observations', 'SURAJ_HSE_OBSERVATIONS.xlsx');
  }

  if (!canEdit) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-base font-semibold text-slate-900">Read-Only Access</p>
        <p className="text-sm text-slate-600 mt-1">
          Your role ({user.role}) does not have permission to generate or log new AI safety observations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            AI Safety Observation Generator
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Upload or capture a site photo. Gemini analyzes visible evidence only and marks unverified items for site inspection.
          </p>
        </div>
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

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Photo Upload, Camera Capture & Context */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900">
            1. Site Photo Evidence &amp; Context
          </h2>

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 text-center">
            {imagePreview ? (
              <div className="space-y-3">
                <img
                  src={imagePreview}
                  alt="Site observation preview"
                  className="w-full max-h-64 object-contain rounded-lg bg-slate-900"
                />
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer"
                  >
                    Change Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview('');
                      setSavedPhotoPath('');
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-8 space-y-3">
                <ImageIcon className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-slate-700">
                  Upload from gallery or capture via mobile/PC camera
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Photo
                  </button>
                  <button
                    type="button"
                    onClick={openLiveCamera}
                    className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-[#0B2545] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Capture Camera
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Location / Plant Zone *
              </label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Steel Melt Shop - Bay 3"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Agency / Contractor
              </label>
              <input
                type="text"
                value={form.agencyName}
                onChange={(e) => setForm({ ...form, agencyName: e.target.value })}
                placeholder="Contractor name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Executor
              </label>
              <input
                type="text"
                value={form.jobExecutor}
                onChange={(e) => setForm({ ...form, jobExecutor: e.target.value })}
                placeholder="Supervisor / Foreman"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Activity
              </label>
              <input
                type="text"
                value={form.workActivity}
                onChange={(e) => setForm({ ...form, workActivity: e.target.value })}
                placeholder="e.g. Scaffolding erection / Gas cutting / Crane lifting"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Safety Category
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="Auto">Auto-Detect from Photo</option>
                {SAFETY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Output Language Focus
              </label>
              <select
                value={form.language}
                onChange={(e) =>
                  setForm({ ...form, language: e.target.value as EditableObservationForm['language'] })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="Bilingual">English + Hindi (Bilingual)</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi (हिंदी)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full py-2.5 px-4 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            {analyzing ? 'Analyzing Visible Photo Evidence...' : 'Analyze Photo with AI'}
          </button>
        </div>

        {/* Right: Editable AI Observation Report & Export */}
        <div className="lg:col-span-7 space-y-4">
          <div ref={cardRef} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 print-container">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <p className="text-xs font-semibold text-blue-700">
                  SURAJ HSE · OBSERVATION WORKSHEET {savedObsCode ? `· ${savedObsCode}` : ''}
                </p>
                <h2 className="font-display text-base font-bold text-slate-900">
                  2. Review, Edit &amp; Export Observation
                </h2>
              </div>
              <RiskText level={form.riskLevel} />
            </div>

            {!hasAnalysis && !form.title && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                Upload a site photo and click <strong>Analyze Photo with AI</strong> to auto-populate all fields below based strictly on visible evidence, or type manually to log an observation.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observation Title *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Classification
                </label>
                <select
                  value={form.observationType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      observationType: e.target.value as EditableObservationForm['observationType'],
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Unsafe Act">Unsafe Act</option>
                  <option value="Unsafe Condition">Unsafe Condition</option>
                  <option value="Both">Both (Act &amp; Condition)</option>
                  <option value="Positive Observation">Positive Observation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Risk Level
                </label>
                <select
                  value={form.riskLevel}
                  onChange={(e) =>
                    setForm({ ...form, riskLevel: e.target.value as EditableObservationForm['riskLevel'] })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                  <option value="Needs Verification">Needs Verification</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detected Category
                </label>
                <input
                  type="text"
                  value={form.detectedCategory}
                  onChange={(e) => setForm({ ...form, detectedCategory: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Closure Date
                </label>
                <input
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Photo Summary (Visible Evidence Only)
                </label>
                <textarea
                  rows={2}
                  value={form.photoSummary}
                  onChange={(e) => setForm({ ...form, photoSummary: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hazard *
                </label>
                <textarea
                  rows={2}
                  value={form.hazard}
                  onChange={(e) => setForm({ ...form, hazard: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Potential Consequence
                </label>
                <textarea
                  rows={2}
                  value={form.potentialConsequence}
                  onChange={(e) => setForm({ ...form, potentialConsequence: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Corrective Action *
                </label>
                <textarea
                  rows={2}
                  value={form.correctiveAction}
                  onChange={(e) => setForm({ ...form, correctiveAction: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preventive Action
                </label>
                <textarea
                  rows={2}
                  value={form.preventiveAction}
                  onChange={(e) => setForm({ ...form, preventiveAction: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Precautions &amp; PPE
                </label>
                <input
                  type="text"
                  value={form.precaution}
                  onChange={(e) => setForm({ ...form, precaution: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Responsible Person
                </label>
                <input
                  type="text"
                  value={form.responsiblePerson}
                  onChange={(e) => setForm({ ...form, responsiblePerson: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Site Verification Required (Unseen Details)
                </label>
                <input
                  type="text"
                  value={form.siteVerification}
                  onChange={(e) => setForm({ ...form, siteVerification: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-amber-50/40"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Professional Safety Observation (English)
                </label>
                <textarea
                  rows={3}
                  value={form.observationEnglish}
                  onChange={(e) => setForm({ ...form, observationEnglish: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hindi Explanation (हिंदी विवरण एवं सुरक्षा निर्देश)
                </label>
                <textarea
                  rows={3}
                  value={form.hindiExplanation}
                  onChange={(e) => setForm({ ...form, hindiExplanation: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-2.5 no-print">
            <button
              type="button"
              onClick={saveObservationToDb}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4 text-amber-400" />
              {saving ? 'Saving...' : savedObsId ? 'Saved' : 'Save Observation'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-red-600" />
              Download PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadCardPng}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-700" />
              Download Image
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Live Camera Capture Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Capture Site Safety Photo
              </h3>
              <button onClick={closeCamera} className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full max-h-[60vh] object-contain" />
            </div>
            <div className="p-4 flex justify-end gap-2">
              <button
                onClick={closeCamera}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={captureFrame}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B2545] text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-amber-400" />
                Capture Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
