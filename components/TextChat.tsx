
import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, AlertCircle, Loader2 } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AudioVisualizer } from './AudioVisualizer';
import { decodeAudioData, createPcmBlob, downsampleBuffer } from '../services/audioUtils';

interface VoiceChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ courseContent, systemInstruction, apiKey }) => {
  // UI States
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio Contexts & Nodes
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);

  // Scheduling & Sources
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const fullSystemInstruction = `${systemInstruction}\n\nCONTENU DU COURS (Source Unique de Vérité) :\n${courseContent}`;

  const disconnect = () => {
    if (processorRef.current) processorRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();

    audioSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    audioSourcesRef.current.clear();

    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    streamRef.current = null;
    processorRef.current = null;
    sessionPromiseRef.current = null;
    nextStartTimeRef.current = 0;
    
    setStatus('disconnected');
    setVolumeLevel(0);
  };

  const connect = async () => {
    if (status !== 'disconnected') return;
    setStatus('connecting');
    setErrorMsg(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      // Setup Output Context (for playback)
      outputAudioContextRef.current = new AudioContextClass();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();
      outputNodeRef.current = outputAudioContextRef.current.createGain();
      outputNodeRef.current.connect(outputAudioContextRef.current.destination);

      // Setup Session
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.0-flash-exp', // Model from App A
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: fullSystemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
          },
        },
        callbacks: {
          onopen: () => {
            console.log('Session opened');
            setStatus('connected');
            startMic();
          },
          onmessage: async (message: LiveServerMessage) => {
            handleServerMessage(message);
          },
          onclose: () => {
            console.log('Session closed');
            disconnect();
          },
          onerror: (e) => {
            console.error('Session error', e);
            setStatus('error');
            setErrorMsg("Erreur de communication avec l'IA.");
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg("Impossible d'initialiser la session.");
    }
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();

      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      const nativeSampleRate = inputAudioContextRef.current.sampleRate;

      processor.onaudioprocess = (e) => {
        if (isMuted) {
          setVolumeLevel(0);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Volume visualizer
        let sum = 0;
        for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        // Manual downsampling if needed
        let data16k = inputData;
        if (nativeSampleRate !== 16000) {
          data16k = downsampleBuffer(inputData, nativeSampleRate, 16000);
        }

        const pcmBlob = createPcmBlob(data16k);
        sessionPromiseRef.current?.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(processor);
      // Connect to a mute node to keep context alive on some browsers
      const dummy = inputAudioContextRef.current.createGain();
      dummy.gain.value = 0;
      processor.connect(dummy);
      dummy.connect(inputAudioContextRef.current.destination);

      processorRef.current = processor;
    } catch (err) {
      console.error("Mic access failed", err);
      setErrorMsg("Accès au microphone refusé.");
      setStatus('error');
    }
  };

  const handleServerMessage = async (message: LiveServerMessage) => {
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && outputAudioContextRef.current && outputNodeRef.current) {
      const ctx = outputAudioContextRef.current;
      const audioBuffer = await decodeAudioData(audioData, ctx);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputNodeRef.current);

      const now = ctx.currentTime;
      if (nextStartTimeRef.current < now) nextStartTimeRef.current = now;
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      audioSourcesRef.current.add(source);
      source.onended = () => audioSourcesRef.current.delete(source);
    }

    if (message.serverContent?.interrupted) {
      audioSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
      audioSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
    }
  };

  const toggleMute = () => setIsMuted(!isMuted);

  useEffect(() => {
    return () => disconnect();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto w-full bg-slate-900 rounded-xl shadow-2xl overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 pointer-events-none"></div>

      <div className="z-10 flex flex-col items-center gap-10 p-8 text-center w-full max-w-md">
        <div className="space-y-2">
            <h2 className="text-3xl font-serif font-bold text-white tracking-tight">Mode Oral (Direct)</h2>
            <p className="text-slate-400">Échangez de vive voix avec votre assistant en droit.</p>
        </div>

        <div className="relative">
            <AudioVisualizer level={volumeLevel} isActive={status === 'connected'} />
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase transition-colors ${
                status === 'connected' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 
                status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                'bg-slate-700 text-slate-400 border border-slate-600'
            }`}>
                {status === 'connected' ? 'En ligne' : status === 'connecting' ? 'Connexion...' : 'Prêt'}
            </div>
        </div>

        {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200 text-sm text-left animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={20} className="shrink-0" />
                <p>{errorMsg}</p>
            </div>
        )}

        <div className="flex items-center gap-6">
            {status === 'connected' || status === 'connecting' ? (
                <>
                    <button 
                        onClick={toggleMute}
                        className={`p-5 rounded-full transition-all ${
                            isMuted 
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                            : 'bg-slate-800 text-white hover:bg-slate-700'
                        }`}
                        title={isMuted ? "Réactiver micro" : "Couper micro"}
                    >
                        {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                    </button>
                    <button 
                        onClick={disconnect}
                        className="p-5 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/30 transition-all transform hover:scale-105"
                        title="Raccrocher"
                    >
                        <PhoneOff size={28} />
                    </button>
                </>
            ) : (
                <button 
                    onClick={connect}
                    className="flex items-center gap-3 px-8 py-4 rounded-full bg-blue-600 text-white font-semibold text-lg hover:bg-blue-500 shadow-xl shadow-blue-600/20 transition-all transform hover:scale-105 active:scale-95"
                >
                    <Phone size={24} />
                    <span>Démarrer l'appel</span>
                </button>
            )}
        </div>
      </div>
    </div>
  );
};
